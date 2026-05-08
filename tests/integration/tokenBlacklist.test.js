const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenBlacklist, hashToken } = require('../../middleware/tokenBlacklist');

test('tokenBlacklist: add + isBlacklisted (in-memory)', async () => {
  const bl = new TokenBlacklist();
  try {
    assert.equal(await bl.isBlacklisted('a.b.c'), false);
    await bl.add('a.b.c', 60);
    assert.equal(await bl.isBlacklisted('a.b.c'), true);
  } finally {
    await bl.close();
  }
});

test('tokenBlacklist: TTL expiry removes entry on read', async () => {
  const bl = new TokenBlacklist();
  try {
    await bl.add('expiring', 0); // ttl clamped to >=1ms internally; real-time guard
    bl._store.set('expiring', Date.now() - 1000);
    assert.equal(await bl.isBlacklisted('expiring'), false);
  } finally {
    await bl.close();
  }
});

test('tokenBlacklist: empty token always returns false', async () => {
  const bl = new TokenBlacklist();
  try {
    assert.equal(await bl.isBlacklisted(''), false);
    assert.equal(await bl.isBlacklisted(undefined), false);
    assert.equal(await bl.isBlacklisted(null), false);
  } finally {
    await bl.close();
  }
});

test('tokenBlacklist: distinct tokens hash to distinct keys', () => {
  const a = hashToken('alpha');
  const b = hashToken('beta');
  assert.notEqual(a, b);
  assert.equal(a.length, 64);
});