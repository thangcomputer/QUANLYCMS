const express    = require('express');
const http       = require('http');
const mongoose   = require('mongoose');
const cors       = require('cors');
const compression = require('compression');
const helmet     = require('helmet');
const hpp        = require('hpp');
const cookieParser = require('cookie-parser');
const session    = require('express-session');
const dotenv     = require('dotenv');
const mongoSanitize = require('./middleware/mongoSanitize');
const { Server } = require('socket.io');
const cron       = require('node-cron');
const pinoHttp   = require('pino-http');
const connectDB  = require('./config/db');

if (process.env.NODE_ENV !== 'test') dotenv.config();
require('./config/validateEnv')();

const logger = require('./config/logger');
const { buildConversationId } = require('./utils/chatConversationId');
const { getMessagingRole } = require('./utils/messagingRoles');
const { logDelivery } = require('./services/messagingObservability');

const app    = express();
const server = http.createServer(app);

const trustProxy = process.env.TRUST_PROXY === '0' ? false : (parseInt(process.env.TRUST_PROXY, 10) || 1);
app.set('trust proxy', trustProxy);

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const cookieSecret = process.env.COOKIE_SECRET || process.env.JWT_SECRET;

const viteLocalOrigins = [5173, 5174, 5175, 5176, 5177].flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]);
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  ...viteLocalOrigins,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

const corsOriginFn = (origin, cb) => {
  if (!origin) return cb(null, true);
  if (allowedOrigins.includes(origin)) return cb(null, true);
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  cb(null, false);
};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const { attachSocketIoAdapter } = require('./config/socketIoAdapter');
const presenceStore = require('./config/presenceStore');

/** Compat Map-like view cho authRoutes / legacy */
const onlineUsers = {
  has(key) { return Boolean(presenceStore.getPresence(key)); },
  get(key) { return presenceStore.getPresence(key); },
  values() {
    const arr = presenceStore.listPresence();
    return {
      [Symbol.iterator]: function* () { yield* arr; },
    };
  },
  entries() {
    const arr = presenceStore.listPresence();
    return {
      [Symbol.iterator]: function* () {
        for (const u of arr) yield [`${u.role}_${u.userId}`, u];
      },
    };
  },
  get size() { return presenceStore.listPresence().length; },
};

const lastSeenMap = new Map();
const LAST_SEEN_MAX = 5000;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(compression({ level: 6, threshold: 1024 }));

// Static uploads — không gắn CSP Helmet (tránh header gây nhiễu khi tải file)
function safeDownloadFilename(name) {
  const s = String(name || '').replace(/[/\\?\0\r\n]/g, '_').trim();
  if (!s || s === '.' || s === '..') return '';
  return s.slice(0, 240);
}

const { uploadsAuthMiddleware } = require('./middleware/uploadsAuth');

app.use('/uploads', uploadsAuthMiddleware, (req, res, next) => {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const forceDownload = req.query.download === '1' || req.query.download === 'true' || !!req.query.downloadAs;
  const isArchive = /\.(zip|rar|7z|tar)$/i.test(req.path);
  const isViewable = /\.(pdf|png|jpe?g|gif|webp|mp4|webm)$/i.test(req.path);
  const isOffice = /\.(docx?|xlsx?|pptx?)$/i.test(req.path);

  if (forceDownload || isArchive) {
    const diskName = decodeURIComponent(req.path.split('/').pop() || 'file');
    const customName = safeDownloadFilename(req.query.downloadAs);
    const useName = customName || diskName;
    const asciiFallback = useName.replace(/[^\x20-\x7E]/g, '_') || diskName;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(useName)}`,
    );
  } else if (isViewable || isOffice) {
    res.setHeader('Content-Disposition', 'inline');
  }
  next();
}, express.static('uploads'));

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    useDefaults: true,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(cookieParser(cookieSecret));

const { csrfProtection } = require('./middleware/csrf');
app.use('/api', csrfProtection);

const sessionOptions = {
  name: 'qcms.sid',
  secret: cookieSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  },
};

if (isProd && process.env.MONGODB_URI) {
  try {
    const MongoStore = require('connect-mongo');
    sessionOptions.store = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24, // 1 day
      crypto: process.env.SESSION_ENCRYPTION_KEY
        ? { secret: process.env.SESSION_ENCRYPTION_KEY }
        : undefined,
    });
  } catch (e) {
    logger.warn({ err: e.message }, 'connect-mongo unavailable; falling back to MemoryStore');
  }
}

app.use(session(sessionOptions));

app.use(pinoHttp({ logger }));
app.use(require('./shared/middleware/requestContext'));

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '1mb';
app.use(express.json({
  limit: JSON_BODY_LIMIT,
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return origJson(body);
  };
  next();
});
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());

app.get('/healthz', (req, res) => {
  // Public probe — nhe, tuong thich cu; chi tiet o /api/monitoring/*
  const monitoring = require('./services/monitoringService');
  const h = monitoring.getHealth();
  res.status(h.ok ? 200 : 503).json({
    ok: h.ok,
    status: h.status,
    db: h.db.status,
    redis: h.redis.status,
    queue: h.queue.mode,
    uptime: h.uptimeSec,
    memory: { rssMb: h.memory.rssMb, heapUsedMb: h.memory.heapUsedMb },
  });
});

// Phase 10 load-test probe — loopback only, gated by PHASE10_LOADTEST=1
if (process.env.PHASE10_LOADTEST === '1') {
  const { monitorEventLoopDelay } = require('perf_hooks');
  const elHistogram = monitorEventLoopDelay({ resolution: 20 });
  elHistogram.enable();
  let lastCpu = process.cpuUsage();
  let lastCpuAt = Date.now();
  app.get('/__phase10/stats', (req, res) => {
    const ra = req.socket.remoteAddress || '';
    const loopback =
      ra === '127.0.0.1' ||
      ra === '::1' ||
      ra === '::ffff:127.0.0.1';
    if (!loopback) return res.status(403).json({ ok: false });
    const now = Date.now();
    const cpu = process.cpuUsage(lastCpu);
    const elapsedMs = Math.max(1, now - lastCpuAt);
    lastCpu = process.cpuUsage();
    lastCpuAt = now;
    const cpuPct = Math.min(100, ((cpu.user + cpu.system) / 1000 / elapsedMs) * 100);
    const mem = process.memoryUsage();
    const nsToMs = (ns) => Math.round((Number(ns) / 1e6) * 1000) / 1000;
    res.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      sockets: typeof io?.engine?.clientsCount === 'number' ? io.engine.clientsCount : null,
      memory: {
        rssMb: Math.round((mem.rss / 1048576) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1048576) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1048576) * 10) / 10,
        externalMb: Math.round((mem.external / 1048576) * 10) / 10,
      },
      cpuPct: Math.round(cpuPct * 10) / 10,
      eventLoopMs: {
        mean: nsToMs(elHistogram.mean),
        max: nsToMs(elHistogram.max),
        p50: nsToMs(elHistogram.percentile(50)),
        p95: nsToMs(elHistogram.percentile(95)),
        p99: nsToMs(elHistogram.percentile(99)),
      },
    });
    elHistogram.reset();
  });
}

// Phase 8.20C — loopback-only RUNTIME evidence export (NOT under /api public proxy)
app.use('/internal/rbac', require('./routes/internalRbacRoutes'));

// Request metrics (Phase 10) — truoc routes API
app.use(require('./middleware/requestMetrics'));

app.set('io', io);
app.set('onlineUsers', onlineUsers);
global.io = io;

const systemLogger = require('./middleware/systemLogger');
app.use(systemLogger);

const { apiRateLimitUnlessAuth } = require('./middleware/apiRateLimit');
app.use('/api', apiRateLimitUnlessAuth);

const dbReady = connectDB();
const outboxWorker = require('./shared/outbox/OutboxWorker');
if (!isTest) outboxWorker.start();

// ==========================================
// SOCKET.IO - REAL-TIME
// ==========================================
const { socketAuthMiddleware } = require('./middleware/socketAuth');
const Group = require('./models/Group');

function socketUserId(user) {
  return String(user?.id || user?._id || '');
}

function isAdminSocketUser(user) {
  if (!user) return false;
  return user.id === 'admin' || user.role === 'admin' || user.role === 'staff';
}

function trimLastSeenMap() {
  if (lastSeenMap.size <= LAST_SEEN_MAX) return;
  const entries = [...lastSeenMap.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const remove = entries.length - LAST_SEEN_MAX;
  for (let i = 0; i < remove; i++) {
    lastSeenMap.delete(entries[i][0]);
  }
}

function mapOnlineUser(u) {
  return {
    userId: u.userId,
    role: u.role,
    adminRole: u.adminRole || null,
    name: u.name,
    branchId: u.branchId,
    connectedAt: u.connectedAt,
  };
}

/** Presence theo chi nhánh — Super/High/Staff/Support nhận full list qua ALL_*.
 *  Teacher/Student nhận list scoped theo presence_<branchId> / presence_none.
 *  Ops roles must not join presence_* (see register) or the second emit overwrites. */
function broadcastOnlinePresence() {
  const all = presenceStore.listPresence();
  const full = all.map(mapOnlineUser);
  io.to('ALL_ADMIN').to('ALL_STAFF').to('ALL_SUPPORT').emit('users:online', full);

  const byBranch = new Map();
  for (const u of all) {
    const bid = u.branchId ? String(u.branchId) : '_none';
    if (!byBranch.has(bid)) byBranch.set(bid, []);
    byBranch.get(bid).push(u);
  }

  for (const [bid, users] of byBranch.entries()) {
    const room = bid === '_none' ? 'presence_none' : `presence_${bid}`;
    const admins = full.filter((x) => (
      x.role === 'admin'
      || x.role === 'staff'
      || x.role === 'support'
      || x.adminRole === 'STAFF'
      || x.adminRole === 'SUPPORT'
      || x.userId === 'admin'
    ));
    const localRows = users.map(mapOnlineUser);
    const seen = new Set();
    const payload = [];
    for (const row of [...localRows, ...admins]) {
      const k = `${row.role}_${row.userId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      payload.push(row);
    }
    io.to(room).emit('users:online', payload);
  }
}

presenceStore.onPresenceChange(() => {
  try { broadcastOnlinePresence(); } catch { /* ignore */ }
});

io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  if (socket.user) {
    const uid = socketUserId(socket.user);
    const mRole = getMessagingRole(socket.user);
    if (uid) socket.join(uid);
    socket.join('feed_room');
    if (mRole) {
      const uRole = mRole.toUpperCase();
      socket.join(`ALL_${uRole}`);
      if (mRole === 'student') socket.join(`student_${uid}`);
      if (mRole === 'teacher') socket.join(`teacher_${uid}`);
      if (mRole === 'admin' || mRole === 'staff') socket.join('admin_room');
    }
  }

  // Đăng ký user online — CHẶN SPOOFING: lấy ID/Role từ JWT thay vì tin client 100%
  socket.on('register', async ({ branchId: _clientBranchId, branchCode: _clientBranchCode } = {}) => {
    if (!socket.user) return;

    const userId = socketUserId(socket.user);
    const messagingRole = getMessagingRole(socket.user);
    const name   = socket.user.name || 'User';
    const key    = `${messagingRole}_${userId}`;
    // Branch chỉ từ JWT — không tin client (chống spoof room)
    const resolvedBranchId = socket.user.branchId || null;
    const resolvedBranchCode = socket.user.branchCode || '';

    await presenceStore.upsertPresence(key, {
      socketId: socket.id,
      userId,
      role: messagingRole,
      adminRole: socket.user.adminRole || null,
      name,
      branchId: resolvedBranchId,
      branchCode: resolvedBranchCode,
      connectedAt: new Date().toISOString(),
    });

    console.log(`👤 Online (Verified): ${name} (${messagingRole}) - ${key}`);

    // Join rooms for Centralized Notification Service
    socket.join(userId);           // Unique user room
    socket.join('feed_room');       // Bang tin (realtime) — không join GLOBAL data bus
    // Explicit deny: never honor client-requested GLOBAL
    try { socket.leave('GLOBAL'); } catch { /* ignore */ }

    if (messagingRole) {
      const uRole = messagingRole.toUpperCase();
      socket.join(`ALL_${uRole}`);

      if (socket.user.adminRole === 'STAFF' || messagingRole === 'staff') {
        socket.join('ALL_STAFF');
      }
      if (socket.user.adminRole === 'SUPPORT' || messagingRole === 'support') {
        socket.join('ALL_SUPPORT');
      }
      if (userId === 'admin' || socket.user?.adminRole === 'SUPER_ADMIN' || socket.user?.adminRole === 'HIGH_ADMIN') {
        socket.join('ALL_ADMIN');
      }

      // STAFF / SUPPORT / SUPER / HIGH already get the full presence list via ALL_*.
      // Do NOT also join presence_* — the branch emit would overwrite FE state and drop
      // branchless / cross-branch peers (e.g. Staff cannot see online Teacher with no branchId).
      const getsFullPresence = (
        userId === 'admin'
        || socket.user?.adminRole === 'SUPER_ADMIN'
        || socket.user?.adminRole === 'HIGH_ADMIN'
        || socket.user?.adminRole === 'STAFF'
        || socket.user?.adminRole === 'SUPPORT'
        || messagingRole === 'staff'
        || messagingRole === 'admin'
      );

      if (resolvedBranchId) {
        const bid = resolvedBranchId;
        socket.join(`ALL_${uRole}_${bid}`);
        socket.join(`branch_${bid}`);
        if (!getsFullPresence) {
          socket.join(`presence_${bid}`);
        }
      } else if (!getsFullPresence) {
        socket.join('presence_none');
      }
      
      if (resolvedBranchCode) {
        const bcode = resolvedBranchCode;
        socket.join(`ALL_${uRole}_${bcode}`);
      }
    }

    // Tự động join các room nhóm chat của user
    try {
      const GroupModel = require('./models/Group');
      const targetUserIds = [...new Set([
        String(userId || ''),
        String(socket.user.id || ''),
        String(socket.user._id || ''),
        ...(socket.user?.adminRole === 'SUPER_ADMIN' || userId === 'admin' ? ['admin'] : []),
      ].filter(Boolean))];
      GroupModel.find({
        $or: [
          { 'participants.userId': { $in: targetUserIds } },
          { 'createdBy.userId': { $in: targetUserIds } },
        ],
      }).select('_id').lean().then((userGroups) => {
        (userGroups || []).forEach((g) => {
          if (g?._id) socket.join(`group_${g._id}`);
        });
      }).catch(() => {});
    } catch (_) { /* ignore */ }

    // Broadcast danh sách online (scoped)
    broadcastOnlinePresence();
  });

  // ── Nhắn tin 1-1 — luôn lấy người gửi từ JWT (socket.user), không tin client ──
  // BUG-13: Simple rate limiting cho socket events
  const socketRateMap = new Map();
  const SOCKET_MSG_LIMIT = 30; // max messages per window
  const SOCKET_MSG_WINDOW = 10_000; // 10 seconds

  function checkSocketRate(key) {
    const now = Date.now();
    let entry = socketRateMap.get(key);
    if (!entry || now - entry.start > SOCKET_MSG_WINDOW) {
      entry = { start: now, count: 0 };
      socketRateMap.set(key);
    }
    entry.count++;
    socketRateMap.set(key, entry);
    return entry.count <= SOCKET_MSG_LIMIT;
  }

  // Cleanup rate map mỗi 30 giây
  const rateCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of socketRateMap) {
      if (now - v.start > SOCKET_MSG_WINDOW * 2) socketRateMap.delete(k);
    }
  }, 30_000);
  socket.on('disconnect', () => { /* cleanup handled below */ });

  socket.on('message:send', async (data) => {
    if (!socket.user) return;
    const u = socket.user;
    const senderId = String(u.id || u._id);

    if (!checkSocketRate(`msg_${senderId}`)) return;

    const rawContent = String(data?.content || '').trim();
    const isBroadcast =
      data?.receiverId === 'ALL_USERS' ||
      data?.receiverId === 'ALL_STUDENTS' ||
      data?.receiverId === 'ALL_TEACHERS' ||
      String(data?.receiverId || '').startsWith('ALL_BRANCH_');
    const isFileMsg = data?.messageType === 'file' || data?.messageType === 'image';
    if (!isFileMsg && !isBroadcast && !rawContent) return;
    if (rawContent.length > 2000) return;

    const {
      runWithMessagingCorrelation,
      newCorrelationId,
      logMessagingEvent,
    } = require('./services/messagingObservability');

    await runWithMessagingCorrelation({
      correlationId: newCorrelationId('sock'),
      channel: 'socket',
    }, async () => {
    // Broadcast stays on role/global rooms (admin/staff only) — not private DM path
    if (isBroadcast) {
      if (!isAdminSocketUser(u)) return;
      const senderMessagingRole = getMessagingRole(u);
      const convId = buildConversationId(
        senderMessagingRole,
        senderId,
        'system',
        String(data.receiverId).replace(/[^a-zA-Z0-9_]/g, '_'),
      );
      const msgPayload = {
        _id: `msg_${Date.now()}`,
        content: rawContent,
        senderId,
        senderName: u.name || 'User',
        senderRole: senderMessagingRole,
        receiverId: data.receiverId,
        receiverRole: 'system',
        conversationId: convId,
        messageType: data.messageType || 'text',
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      if (data.receiverId === 'ALL_USERS') io.emit('message:receive', msgPayload);
      else if (data.receiverId === 'ALL_STUDENTS') io.to('ALL_STUDENT').emit('message:receive', msgPayload);
      else if (data.receiverId === 'ALL_TEACHERS') io.to('ALL_TEACHER').emit('message:receive', msgPayload);
      else if (String(data.receiverId).startsWith('ALL_BRANCH_')) {
        const bCode = String(data.receiverId).replace('ALL_BRANCH_', '');
        io.to(`ALL_STUDENT_${bCode}`).to(`ALL_TEACHER_${bCode}`).to(`ALL_STAFF_${bCode}`).to(`ALL_SUPPORT_${bCode}`).emit('message:receive', msgPayload);
      }
      socket.emit('message:sent', msgPayload);
      return;
    }

    try {
      const { sendCanonicalMessage } = require('./services/directMessageService');
      const result = await sendCanonicalMessage({
        sender: u,
        receiverId: data.receiverId,
        receiverName: data.receiverName,
        receiverRole: data.receiverRole,
        content: rawContent,
        messageType: data.messageType || 'text',
        fileUrl: data.fileUrl || '',
        fileName: data.fileName || '',
        isGroup: Boolean(data.isGroup),
        groupId: data.groupId || null,
        conversationId: data.conversationId || null,
        payload: data.payload && typeof data.payload === 'object' ? data.payload : null,
        notifyUser: app.notifyUser,
        io,
      });
      if (!result.ok) {
        logMessagingEvent('warn', 'messaging.socket.send_denied', {
          senderId,
          receiverId: data.receiverId ? String(data.receiverId) : null,
          code: result.code || null,
          policy: result.policy || null,
          reason: result.message || null,
          socketId: socket.id,
        });
        return;
      }
      socket.emit('message:sent', result.clientMessage);
    } catch (err) {
      logMessagingEvent('error', 'messaging.socket.send_error', {
        senderId,
        socketId: socket.id,
        err: err?.message || 'unknown',
      });
      return;
    }
    });
  });

  // ── Đánh dấu đã đọc ──
  socket.on('message:read', ({ conversationId }) => {
    if (!socket.user) return;
    const readerId = socketUserId(socket.user);
    const {
      listTypingReadPeerTokens,
      resolveTypingReadPeerRooms,
    } = require('./utils/messagingRoles');
    const { canMarkRead } = require('./services/messagingPolicy');
    const cid = String(conversationId || '');
    if (cid.startsWith('group_')) {
      const gid = cid.slice('group_'.length);
      if (!socket.rooms.has(`group_${gid}`)) return;
      socket.to(`group_${gid}`).emit('message:read_ack', { conversationId: cid, readerId });
      return;
    }
    // Phase 4: conversation access via MessagingPolicy (wraps canAccessDirectConversation)
    if (!canMarkRead(socket.user, cid).allowed) return;
    // Phase 8.22: legacy admin_admin → admin + ALL_ADMIN (SUPER/HIGH); never ALL_STAFF/SUPPORT.
    // socket.to excludes sender (ObjectId SUPER in ALL_ADMIN must not echo self).
    for (const t of listTypingReadPeerTokens(cid, readerId)) {
      const rooms = resolveTypingReadPeerRooms(t);
      if (!rooms.length) continue;
      let chain = socket.to(rooms[0]);
      for (let i = 1; i < rooms.length; i += 1) chain = chain.to(rooms[i]);
      chain.emit('message:read_ack', { conversationId: cid, readerId });
    }
  });

  // ── Đánh dấu đang gõ ──
  socket.on('typing:start', ({ conversationId, userName }) => {
    if (!socket.user) return;
    const userId = socketUserId(socket.user);
    const {
      listTypingReadPeerTokens,
      resolveTypingReadPeerRooms,
      getMessagingRole: gmr,
    } = require('./utils/messagingRoles');
    const { canViewConversation } = require('./services/messagingPolicy');
    const cid = String(conversationId || '');
    if (!canViewConversation(socket.user, cid).allowed) return;
    const payload = {
      conversationId: cid,
      userId,
      userName: userName || socket.user.name || 'User',
      userRole: gmr(socket.user),
    };
    for (const t of listTypingReadPeerTokens(cid, userId)) {
      const rooms = resolveTypingReadPeerRooms(t);
      if (!rooms.length) continue;
      let chain = socket.to(rooms[0]);
      for (let i = 1; i < rooms.length; i += 1) chain = chain.to(rooms[i]);
      chain.emit('typing:show', payload);
    }
  });
  socket.on('typing:stop', ({ conversationId }) => {
    if (!socket.user) return;
    const userId = socketUserId(socket.user);
    const {
      listTypingReadPeerTokens,
      resolveTypingReadPeerRooms,
    } = require('./utils/messagingRoles');
    const { canViewConversation } = require('./services/messagingPolicy');
    const cid = String(conversationId || '');
    if (!canViewConversation(socket.user, cid).allowed) return;
    for (const t of listTypingReadPeerTokens(cid, userId)) {
      const rooms = resolveTypingReadPeerRooms(t);
      if (!rooms.length) continue;
      let chain = socket.to(rooms[0]);
      for (let i = 1; i < rooms.length; i += 1) chain = chain.to(rooms[i]);
      chain.emit('typing:hide', { conversationId: cid, userId });
    }
  });

  // ── Nhận report vi phạm thi ──
  socket.on('exam:violation', async (data) => {
    if (!socket.user) return;
    const uid = socketUserId(socket.user);
    const role = socket.user.role;

    if (role === 'student') {
      if (String(data?.studentId || '') !== uid) return;
    } else if (role === 'teacher') {
      if (String(data?.teacherId || '') !== uid) return;
    } else if (!isAdminSocketUser(socket.user)) {
      return;
    }

    // data = { studentId, studentName, teacherId, course, reason }
    const notif = {
      type: 'violation',
      title: '🚨 Vi phạm Giám Sát Thi',
      message: `Học viên ${data.studentName} đã vi phạm (${data.reason}) bài thi ${data.course}. Tài khoản đã bị khóa quyền thi.`,
      date: new Date().toISOString()
    };

    const NotificationService = require('./services/NotificationService');
    const receivers = ['ALL_ADMIN'];
    try {
      const Student = require('./models/Student');
      const student = data?.studentId
        ? await Student.findById(data.studentId).select('branchId').lean()
        : null;
      const branchId = student?.branchId ? String(student.branchId) : '';
      if (branchId) {
        receivers.push(`ALL_ADMIN_${branchId}`);
        receivers.push(`ALL_STAFF_${branchId}`);
      }
    } catch { /* thiếu chi nhánh → vẫn báo ALL_ADMIN */ }

    // Super/High (ALL_ADMIN) + admin chi nhánh HV. Không gửi giáo viên.
    NotificationService.send(io, {
      type: 'EXAM',
      title: notif.title,
      content: notif.message,
      receivers,
      payload: data,
      link: '/admin#students'
    });

    const studentId = data?.studentId ? String(data.studentId) : '';
    if (studentId) {
      const courseLabel = data.course ? String(data.course) : 'chứng chỉ';
      const reasonTxt = data.reason ? String(data.reason) : 'vi phạm giám sát';
      NotificationService.send(io, {
        type: 'EXAM',
        title: '🚨 Bài thi bị hủy',
        content: `Bài thi ${courseLabel} đã bị hủy (${reasonTxt}). Quyền thi của bạn đã bị khóa.`,
        receivers: studentId,
        payload: { ...data, targetAudience: 'student' },
        link: '/student/exam'
      });
    }
     // (Removed io.emit('exam:locked') to prevent INFINITE LOOP with StudentTest resolving 'exam:locked' by emitting 'exam:violation')
  });

  // ── Giảng viên join room riêng để nhận notify ──
  socket.on('teacher:join', ({ teacherId }) => {
    if (!socket.user || !teacherId) return;
    const uid = socketUserId(socket.user);
    const role = getMessagingRole(socket.user);
    if (role !== 'teacher' && !isAdminSocketUser(socket.user)) return;
    if (uid !== String(teacherId) && socket.user.id !== 'admin' && socket.user.adminRole !== 'SUPER_ADMIN' && socket.user.adminRole !== 'HIGH_ADMIN') return;
    socket.join(`teacher_${teacherId}`);
    console.log(`👨‍🏫 Teacher ${teacherId} joined room teacher_${teacherId}`);
  });

  socket.on('student:join', ({ studentId }) => {
    if (!socket.user || !studentId) return;
    const uid = socketUserId(socket.user);
    const role = getMessagingRole(socket.user);
    if (role !== 'student' && !isAdminSocketUser(socket.user)) return;
    if (uid !== String(studentId) && socket.user.id !== 'admin' && socket.user.adminRole !== 'SUPER_ADMIN' && socket.user.adminRole !== 'HIGH_ADMIN') return;
    socket.join(`student_${studentId}`);
    console.log(`🎓 Student ${studentId} joined room student_${studentId}`);
  });

  socket.on('admin:join', () => {
    if (!socket.user || !isAdminSocketUser(socket.user)) return;
    socket.join('admin_room');
    console.log(`🛡️  Admin joined admin_room`);
  });

  socket.on('feed:join', () => {
    if (!socket.user) return;
    socket.join('feed_room');
  });

  // Reject any attempt to join GLOBAL / spoof branch rooms from client
  socket.on('join', (room) => {
    if (!socket.user) return;
    const r = String(room || '');
    if (r === 'GLOBAL' || r === 'global') {
      logger.warn({ socketId: socket.id, userId: socketUserId(socket.user) }, '[socket] denied join GLOBAL');
      return;
    }
    // Branch rooms only via trusted register() — never via raw join
    if (r.startsWith('branch_') || r.startsWith('presence_') || r.startsWith('ALL_')) {
      logger.warn({ socketId: socket.id, room: r }, '[socket] denied raw join of privileged room');
      return;
    }
  });

  socket.on('group:join', async (payload) => {
    const rawId = typeof payload === 'object' && payload?.groupId ? payload.groupId : payload;
    const groupId = String(rawId || '').trim();
    if (!socket.user || !groupId || !mongoose.Types.ObjectId.isValid(groupId)) return;
    try {
      const uid = socketUserId(socket.user);
      const group = await Group.findById(groupId).select('participants createdBy').lean();
      if (!group) return;
      const isMember = (group.participants || []).some((p) => String(p.userId) === uid)
        || String(group.createdBy?.userId) === uid;
      if (!isMember && socket.user.id !== 'admin' && socket.user.adminRole !== 'SUPER_ADMIN' && socket.user.adminRole !== 'HIGH_ADMIN') return;
      socket.join(`group_${groupId}`);
    } catch (err) {
      logger.warn({ err: err.message, groupId }, 'group:join failed');
    }
  });

  // ── Client xác nhận nhận được exam:unlocked ──
  socket.on('exam:unlock_ack', ({ studentId }) => {
    console.log(`✅ [ACK] Học viên ${studentId} đã nhận thông báo unlock thi`);
  });

  // ── Disconnect ──
  socket.on('disconnect', async () => {
    const hit = presenceStore.findPresenceBySocketId(socket.id);
    if (hit) {
      lastSeenMap.set(String(hit.user.userId), new Date().toISOString());
      trimLastSeenMap();
      await presenceStore.removePresence(hit.key);
    }
    // Cleanup socket rate map
    socketRateMap.clear();
    clearInterval(rateCleanup);
    broadcastOnlinePresence();
    // Presence last-seen: role rooms only — không io.emit toàn cục
    io.to('ALL_ADMIN').to('ALL_STAFF').to('ALL_SUPPORT').to('ALL_TEACHER').to('ALL_STUDENT')
      .emit('users:lastSeen', Object.fromEntries(lastSeenMap));
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// ── Hàm gửi notification real-time (NEVER fan-out private messages to ALL_STAFF) ──
app.notifyUser = (role, userId, eventName, data) => {
  const strUserId = String(userId);
  if (strUserId === 'admin') {
    io.to('admin').to('ALL_ADMIN').emit(eventName, data);
    logDelivery({ eventName, targetRole: role, targetUserId: 'admin', mode: 'legacy_admin_mailbox', ok: true });
    return true;
  }

  const tryRoles = [role, getMessagingRole({ id: strUserId, role }), ...(role === 'admin' || role === 'staff' || role === 'support' ? ['admin', 'staff'] : [])];
  for (const r of new Set(tryRoles.filter(Boolean))) {
    const user = onlineUsers.get(`${r}_${strUserId}`);
    if (user?.socketId) {
      io.to(user.socketId).emit(eventName, data);
      logDelivery({ eventName, targetRole: r, targetUserId: strUserId, selectedSocketId: user.socketId, mode: 'presence_socketId', ok: true });
      return true;
    }
  }

  io.to(strUserId).emit(eventName, data);
  logDelivery({ eventName, targetRole: role, targetUserId: strUserId, mode: 'userId_room', ok: true });
  return true;
};

// ── Broadcast cho tất cả user có role nhất định ──
app.broadcastToRole = (role, eventName, data) => {
  io.to(`ALL_${String(role || '').toUpperCase()}`).emit(eventName, data);
};

const studentRoutes      = require('./routes/studentRoutes');
const invoiceRoutes      = require('./routes/invoiceRoutes');
const authRoutes         = require('./routes/authRoutes');
const messageRoutes      = require('./routes/messageRoutes');
const scheduleRoutes     = require('./routes/scheduleRoutes');
const courseRoutes       = require('./routes/courseRoutes');
const teacherRoutes      = require('./routes/teacherRoutes');
const assignmentRoutes   = require('./routes/assignmentRoutes');
const evaluationRoutes   = require('./routes/evaluationRoutes');
const transactionRoutes  = require('./routes/transactionRoutes');
const systemLogRoutes    = require('./routes/systemLogRoutes');
const teachingGuideRoutes = require('./routes/teachingGuideRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const examResultRoutes   = require('./routes/examResultRoutes');
const settingsRoutes     = require('./routes/settingsRoutes');
const webhookRoutes      = require('./routes/webhookRoutes');
const staffRoutes        = require('./routes/staffRoutes');
const branchRoutes       = require('./routes/branchRoutes');
const analyticsRoutes    = require('./routes/analyticsRoutes');  // ← Revenue Analytics
const employeeRoutes     = require('./routes/employeeRoutes');   // ← HR & Payroll
const notificationRoutes = require('./routes/notificationRoutes');
const fileRoutes         = require('./routes/fileRoutes');
const backupRoutes       = require('./routes/backupRoutes');
const monitoringRoutes   = require('./routes/monitoringRoutes');
const proctorRoutes      = require('./routes/proctorRoutes');
const aiRoutes           = require('./routes/aiRoutes');
const aiSupportRoutes    = require('./routes/aiSupportRoutes');
const biRoutes           = require('./routes/biRoutes');
const financeRoutes      = require('./routes/financeRoutes');
const workflowRoutes     = require('./routes/workflowRoutes');
const builderRoutes      = require('./routes/builderRoutes');
const tenantRoutes       = require('./routes/tenantRoutes');
const feedRoutes         = require('./routes/feedRoutes');
const blogRoutes         = require('./routes/blogRoutes');
const centerInfoRoutes   = require('./routes/centerInfoRoutes');
const certPrepRoutes     = require('./routes/certPrepRoutes');
const quizRoutes         = require('./routes/quizRoutes');

app.use('/api/auth',         authRoutes);
app.use('/api/students',     studentRoutes);
app.use('/api/invoices',     invoiceRoutes);
app.use('/api/messages',     messageRoutes);
app.use('/api/schedules',    scheduleRoutes);
app.use('/api/courses',      courseRoutes);
app.use('/api/teachers',     teacherRoutes);
app.use('/api/assignments',  assignmentRoutes);
app.use('/api/quizzes',      quizRoutes);
app.use('/api/evaluations',  evaluationRoutes);
app.use('/api/exam-results', examResultRoutes);
app.use('/api/system-logs',  systemLogRoutes);
app.use('/api/training',     teachingGuideRoutes);
app.use('/api/training-lms', trainingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/settings',     settingsRoutes);
app.use('/api/webhooks',     webhookRoutes);
app.use('/api/staff',        staffRoutes);
app.use('/api/branches',     branchRoutes);
app.use('/api/analytics',    analyticsRoutes);    // ← Revenue Analytics
app.use('/api/employees',    employeeRoutes);     // ← HR & Payroll
app.use('/api/notifications',notificationRoutes);
app.use('/api/files',        fileRoutes);
app.use('/api/backups',      backupRoutes);
app.use('/api/monitoring',  monitoringRoutes);
app.use('/api/proctor',      proctorRoutes);
app.use('/api/ai',           aiRoutes);
app.use('/api/ai-support',   aiSupportRoutes);
app.use('/api/bi',           biRoutes);
app.use('/api/finance',      financeRoutes);
app.use('/api/workflows',    workflowRoutes);
app.use('/api/builder',      builderRoutes);
app.use('/api/tenants',      tenantRoutes);
app.use('/api/feed',         feedRoutes);
app.use('/api/blog',         blogRoutes);
app.use('/api/center-info',  centerInfoRoutes);
app.use('/api/cert-prep',    certPrepRoutes);

// Route mặc định
app.get('/', (req, res) => {
  res.json({
    message: 'DashboardThangTinHoc API - Trung tam Thang Tin Hoc',
    version: '3.0.0',
    features: [
      'Socket.io Real-time',
      'Chat 1-1',
      'Schedule + Exam Unlock (Workflow 2)',
      'Assignment + Grading (Workflow 3)',
      'Teacher Salary (Workflow 4)',
      'Student Evaluation (Workflow 5)',
    ],
    endpoints: {
      auth:         '/api/auth',
      students:     '/api/students',
      teachers:     '/api/teachers',
      invoices:     '/api/invoices',
      messages:     '/api/messages',
      schedules:    '/api/schedules',
      courses:      '/api/courses',
      assignments:  '/api/assignments',
      evaluations:  '/api/evaluations',
      transactions: '/api/transactions',
    },
    socketIO: 'Connected',
  });
});

// ==========================================
// CRON JOB: Tự xóa file/ảnh tin nhắn quá hạn (mặc định 10 ngày)
// ==========================================
const Message = require('./models/Message');
const { purgeExpiredMessageFiles, RETENTION_DAYS } = require('./utils/messageFileRetention');

const runMessageFileRetention = async () => {
  try {
    const purged = await purgeExpiredMessageFiles(Message, logger);
    if (purged > 0) {
      logger.info(`[CRON] Đã xóa ${purged} file tin nhắn quá ${RETENTION_DAYS} ngày`);
    }
  } catch (err) {
    logger.error({ err: err.message }, '[CRON] message file retention');
  }
};

// Mỗi 6 giờ + chạy một lần khi server khởi động (sau khi DB sẵn sàng)
if (!isTest) {
  setTimeout(() => { runMessageFileRetention(); }, 15_000);
  cron.schedule('0 */6 * * *', runMessageFileRetention);
}

// FileAsset registry — purge file hết hạn (Phase 8)
const fileService = require('./services/fileService');
const runFileAssetPurge = async () => {
  try {
    const { purged } = await fileService.purgeExpired();
    if (purged > 0) {
      logger.info(`[CRON] FileAsset: đã xóa ${purged} file hết hạn`);
    }
  } catch (err) {
    logger.error({ err: err.message }, '[CRON] FileAsset purge');
  }
};
if (!isTest) {
  setTimeout(() => { runFileAssetPurge(); }, 20_000);
  cron.schedule('30 */6 * * *', runFileAssetPurge);
}

// Backup định kỳ (Phase 9) — mặc định 03:00 mỗi ngày; tắt bằng BACKUP_SCHEDULE=0
const backupService = require('./services/backupService');
const { enqueueBackup } = require('./services/queue/jobQueue');
const runScheduledBackup = async () => {
  if (process.env.BACKUP_SCHEDULE === '0') return;
  try {
    const job = await backupService.createBackupJob({ type: 'scheduled', createdBy: 'cron' });
    await enqueueBackup({ jobId: String(job._id) });
    logger.info({ jobId: String(job._id) }, '[CRON] Scheduled backup queued');
  } catch (err) {
    logger.error({ err: err.message }, '[CRON] scheduled backup');
  }
};
const backupCronExpr = process.env.BACKUP_CRON || '0 3 * * *';
if (!isTest && process.env.BACKUP_SCHEDULE !== '0') {
  cron.schedule(backupCronExpr, runScheduledBackup);
}

// ==========================================
// CRON JOB: Nhắc lịch học tự động
// ==========================================
// const Schedule = require('./models/Schedule');
// const nodemailer = require('nodemailer');
//
// Chạy mỗi 10 phút - kiểm tra lịch sắp tới và gửi nhắc nhở
if (!isTest) cron.schedule('*/10 * * * *', async () => {
  try {
    // const now = new Date();
    // const thirtyMinsLater = new Date(now.getTime() + 30 * 60000);
    //
    // const upcoming = await Schedule.find({
    //   date: { $gte: now, $lte: thirtyMinsLater },
    //   status: 'scheduled',
    //   reminderSent: false,
    // });
    //
    // for (const sched of upcoming) {
    //   // 1. Gửi notification real-time
    //   app.notifyUser('student', sched.studentId, 'class:reminder', {
    //     message: `Sắp đến giờ học! ${sched.course} lúc ${sched.startTime}`,
    //     linkHoc: sched.linkHoc,
    //     startTime: sched.startTime,
    //   });
    //   app.notifyUser('teacher', sched.teacherId, 'class:reminder', {
    //     message: `Sắp có buổi dạy! ${sched.studentName} - ${sched.course} lúc ${sched.startTime}`,
    //     linkHoc: sched.linkHoc,
    //     startTime: sched.startTime,
    //   });
    //
    //   // 2. Gửi Email (cần cấu hình SMTP trong .env)
    //   // await sendReminderEmail(sched);
    //
    //   // 3. Đánh dấu đã gửi
    //   sched.reminderSent = true;
    //   sched.reminderSentAt = new Date();
    //   await sched.save();
    // }
    //
    // if (upcoming.length > 0) {
    //   console.log(`📧 Đã gửi ${upcoming.length} nhắc lịch học`);
    // }

    logger.info(`[CRON] Kiểm tra lịch học: ${new Date().toLocaleTimeString('vi-VN')}`);
  } catch (err) {
    logger.error({ err: err.message }, '[CRON] schedule check');
  }
});

// ==========================================
// HÀM GỬI EMAIL NHẮC LỊCH
// ==========================================
// Cấu hình trong .env:
// SMTP_HOST=smtp.gmail.com
// SMTP_PORT=587
// SMTP_USER=thangtinhoc@gmail.com
// SMTP_PASS=your_app_password
//
// async function sendReminderEmail(schedule) {
//   const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: process.env.SMTP_PORT,
//     secure: false,
//     auth: {
//       user: process.env.SMTP_USER,
//       pass: process.env.SMTP_PASS,
//     },
//   });
//
//   await transporter.sendMail({
//     from: '"Thắng Tin Học" <thangtinhoc@gmail.com>',
//     to: schedule.studentEmail, // Cần thêm field email vào Schedule
//     subject: `📚 Nhắc lịch học: ${schedule.course} lúc ${schedule.startTime}`,
//     html: `
//       <div style="font-family:Arial; padding:20px; background:#f5f5f5; border-radius:12px;">
//         <img src="https://thangtinhoc.vn/logo.png" width="150" />
//         <h2 style="color:#dc2626;">Sắp đến giờ học!</h2>
//         <p>Xin chào <strong>${schedule.studentName}</strong>,</p>
//         <p>Bạn có buổi học <strong>${schedule.course}</strong> lúc <strong>${schedule.startTime}</strong>.</p>
//         <p>Giảng viên: <strong>${schedule.teacherName}</strong></p>
//         ${schedule.linkHoc ? `<a href="${schedule.linkHoc}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">VÀO LỚP NGAY</a>` : ''}
//         <p style="margin-top:20px;color:#666;font-size:12px;">Thắng Tin Học - Phát triển tri thức Việt</p>
//       </div>
//     `,
//   });
// }

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} khong ton tai`,
  });
});

app.use((err, req, res, next) => {
  if (req.log) req.log.error(err);
  else logger.error(err);

  // Handle Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Định dạng ID không hợp lệ: ${err.value}`,
    });
  }

  res.status(500).json({
    success: false,
    message: 'Lỗi server nội bộ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
const tokenBlacklist = require('./middleware/tokenBlacklist');
const { initJobQueue, closeJobQueue } = require('./services/queue/jobQueue');

(async () => {
  await dbReady;
  await attachSocketIoAdapter(io);
  await presenceStore.initPresenceBus();
  server.listen(PORT, '::', () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development', host: '::' }, 'dashboardthangtinhoc server listening');
    if (!isTest) {
      initJobQueue().catch((err) => logger.warn({ err: err.message }, 'initJobQueue failed'));
    }
    try {
      const { startAiIdleWatcher } = require('./services/aiSupportService');
      startAiIdleWatcher(io, app.notifyUser);
    } catch (idleErr) {
      logger.warn({ err: idleErr.message }, 'startAiIdleWatcher failed');
    }
  });
})().catch((err) => {
  logger.error({ err: err.message }, 'Server boot failed');
  process.exit(1);
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  try {
    try { outboxWorker.stop(); } catch (_) { /* ignore */ }
    try {
      const { stopAiIdleWatcher } = require('./services/aiSupportService');
      stopAiIdleWatcher();
    } catch (_) { /* ignore */ }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closeJobQueue();
    await presenceStore.closePresenceBus();
    await mongoose.connection.close(false);
    await tokenBlacklist.close();
    const { closeRedis } = require('./config/redis');
    await closeRedis();
  } catch (e) {
    logger.error(e);
  }
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io };
