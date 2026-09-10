/**
 * Presence store: Redis Hash khi co REDIS_URL, fallback Map in-process.
 * Multi-instance: moi node publish/subscribe channel cms:presence
 */
const { getRedis, isRedisReady } = require('./redis');
const logger = require('./logger');

function readyRedis() {
  const redis = getRedis();
  if (!redis || !isRedisReady()) return null;
  return redis;
}

const HASH_KEY = 'cms:presence';
const CHANNEL = 'cms:presence';
const TTL_SEC = 120;

/** @type {Map<string, object>} */
const local = new Map();
let subClient = null;
let listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(listPresence()); } catch { /* ignore */ }
  }
}

function listPresence() {
  return Array.from(local.values());
}

function onPresenceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function upsertPresence(key, user) {
  const row = {
    userId: user.userId,
    role: user.role,
    adminRole: user.adminRole || null,
    name: user.name,
    branchId: user.branchId || null,
    branchCode: user.branchCode || '',
    connectedAt: user.connectedAt || new Date().toISOString(),
    socketId: user.socketId || '',
    instanceId: process.env.INSTANCE_ID || process.pid,
  };
  local.set(key, row);

  const redis = readyRedis();
  if (redis) {
    try {
      await redis.hset(HASH_KEY, key, JSON.stringify(row));
      await redis.expire(HASH_KEY, TTL_SEC * 10);
      await redis.publish(CHANNEL, JSON.stringify({ op: 'upsert', key, user: row }));
    } catch (err) {
      logger.warn({ err: err.message }, 'presence upsert redis failed');
    }
  }
  notify();
  return row;
}

async function removePresence(key) {
  local.delete(key);
  const redis = readyRedis();
  if (redis) {
    try {
      await redis.hdel(HASH_KEY, key);
      await redis.publish(CHANNEL, JSON.stringify({ op: 'remove', key }));
    } catch (err) {
      logger.warn({ err: err.message }, 'presence remove redis failed');
    }
  }
  notify();
}

function getPresence(key) {
  return local.get(key) || null;
}

function findPresenceBySocketId(socketId) {
  for (const [key, val] of local.entries()) {
    if (val.socketId === socketId) return { key, user: val };
  }
  return null;
}

async function hydrateFromRedis() {
  const redis = readyRedis();
  if (!redis) return;
  try {
    const all = await redis.hgetall(HASH_KEY);
    for (const [key, raw] of Object.entries(all || {})) {
      try {
        local.set(key, JSON.parse(raw));
      } catch { /* skip */ }
    }
    notify();
  } catch (err) {
    logger.warn({ err: err.message }, 'presence hydrate failed');
  }
}

async function initPresenceBus() {
  const redis = getRedis();
  if (!redis || !isRedisReady()) {
    logger.info('Presence: in-memory only');
    return { mode: 'memory' };
  }
  await hydrateFromRedis();
  try {
    const Redis = require('ioredis');
    subClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 500,
    });
    await subClient.subscribe(CHANNEL);
    subClient.on('message', (_ch, message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.op === 'upsert' && msg.key && msg.user) {
          // Bo qua echo cung instance neu muon — van merge de dong bo
          local.set(msg.key, msg.user);
          notify();
        } else if (msg.op === 'remove' && msg.key) {
          local.delete(msg.key);
          notify();
        }
      } catch { /* ignore */ }
    });
    logger.info('Presence: redis pub/sub');
    return { mode: 'redis' };
  } catch (err) {
    logger.warn({ err: err.message }, 'Presence bus failed — memory only');
    return { mode: 'memory', error: err.message };
  }
}

async function closePresenceBus() {
  if (subClient) {
    try { await subClient.quit(); } catch { /* ignore */ }
    subClient = null;
  }
}

module.exports = {
  listPresence,
  upsertPresence,
  removePresence,
  getPresence,
  findPresenceBySocketId,
  onPresenceChange,
  initPresenceBus,
  closePresenceBus,
  hydrateFromRedis,
};
