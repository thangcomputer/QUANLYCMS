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

dotenv.config();
require('./config/validateEnv')();

const logger = require('./config/logger');

const app    = express();
const server = http.createServer(app);

const trustProxy = process.env.TRUST_PROXY === '0' ? false : (parseInt(process.env.TRUST_PROXY, 10) || 1);
app.set('trust proxy', trustProxy);

const isProd = process.env.NODE_ENV === 'production';
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

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(compression({ level: 6, threshold: 1024 }));

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

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '1mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());
require('./routes/authRoutes');
app.use(require('passport').initialize());
app.use(require('passport').session());

app.get('/healthz', (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk ? 'up' : 'down',
    uptime: process.uptime(),
  });
});

app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static('uploads'));

app.set('io', io);
global.io = io;

const systemLogger = require('./middleware/systemLogger');
app.use(systemLogger);

const { apiRateLimitUnlessAuth } = require('./middleware/apiRateLimit');
app.use('/api', apiRateLimitUnlessAuth);

connectDB();

// ==========================================
// SOCKET.IO - REAL-TIME
// ==========================================
const onlineUsers = new Map();  // { key: { socketId, userId, role, name, branchId, connectedAt } }
const lastSeenMap = new Map();  // { userId: ISO timestamp } — lưu khi disconnect
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.error(`❌ Socket Auth Failed: Token missing for socket ${socket.id}`);
    return next(new Error('Authentication error: Token missing'));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error(`❌ Socket Auth Failed: Invalid token for socket ${socket.id}. Error: ${err.message}`);
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.user = decoded; // Lưu thông tin user vào socket
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Đăng ký user online — CHẶN SPOOFING: lấy ID/Role từ JWT thay vì tin client 100%
  socket.on('register', ({ branchId, branchCode }) => {
    if (!socket.user) return;
    
    const userId = socket.user.id || socket.user._id;
    const role   = socket.user.role;
    const name   = socket.user.name || 'User';
    const key    = `${role}_${userId}`;
    
    onlineUsers.set(key, { 
      socketId: socket.id, 
      userId, 
      role, 
      name, 
      branchId: branchId || socket.user.branchId, 
      branchCode: branchCode || socket.user.branchCode || '',
      connectedAt: new Date().toISOString() 
    });
    
    console.log(`👤 Online (Verified): ${name} (${role}) - ${key}`);

    // Join rooms for Centralized Notification Service
    socket.join(userId);           // Unique user room
    socket.join('GLOBAL');          // Global room
    
    if (role) {
      const uRole = role.toUpperCase();
      socket.join(`ALL_${uRole}`); 
      
      // Admin/Staff join admin rooms
      if (uRole === 'ADMIN' || uRole === 'STAFF') {
        socket.join('ALL_ADMIN');
        socket.join('ALL_STAFF');
      }

      if (branchId || socket.user.branchId) {
        const bid = branchId || socket.user.branchId;
        socket.join(`ALL_${uRole}_${bid}`); 
      }
      
      if (branchCode || socket.user.branchCode) {
        const bcode = branchCode || socket.user.branchCode;
        socket.join(`ALL_${uRole}_${bcode}`);
      }
    }

    // Broadcast danh sách online
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      userId: u.userId, role: u.role, name: u.name, branchId: u.branchId, connectedAt: u.connectedAt
    })));
  });

  // ── Nhắn tin 1-1 — luôn lấy người gửi từ JWT (socket.user), không tin client ──
  socket.on('message:send', (data) => {
    if (!socket.user) return;
    const u = socket.user;
    const isStaff = u.role === 'staff' || u.adminRole === 'STAFF';
    const senderRole = isStaff ? 'admin' : u.role;
    const senderId = String(u.id || u._id);
    const senderName = u.name || 'User';
    data = {
      ...data,
      senderId,
      senderName,
      senderRole,
    };
    // data = { senderId, senderName, senderRole, receiverId, receiverRole, content }
    // Tìm người nhận (Hỗ trợ linh hoạt cả prefix admin_ và staff_)
    let receiver = onlineUsers.get(`${data.receiverRole}_${data.receiverId}`);
    if (!receiver && (data.receiverRole === 'admin' || data.receiverRole === 'staff')) {
      const altRole = data.receiverRole === 'admin' ? 'staff' : 'admin';
      receiver = onlineUsers.get(`${altRole}_${data.receiverId}`);
    }

    // Xác định ID thực tế để tạo conversationId chuẩn (admin/staff đều dùng 'admin' khi chat với student)
    const isOneSideAdmin = (data.senderRole === 'admin' || data.senderRole === 'staff') || (data.receiverRole === 'admin' || data.receiverRole === 'staff');
    const isOneSideStudent = (data.senderRole === 'student' || data.receiverRole === 'student');

    const sIdForConv = ((data.senderRole === 'admin' || data.senderRole === 'staff') && isOneSideStudent) ? 'admin' : data.senderId;
    const rIdForConv = ((data.receiverRole === 'admin' || data.receiverRole === 'staff') && isOneSideStudent) ? 'admin' : data.receiverId;
    
    const sRole = (data.senderRole === 'admin' || data.senderRole === 'staff') ? 'admin' : data.senderRole;
    const rRole = (data.receiverRole === 'admin' || data.receiverRole === 'staff') ? 'admin' : data.receiverRole;
    
    const convId = [`${sRole}_${sIdForConv}`, `${rRole}_${rIdForConv}`].sort().join('__');

    // Lấy branchCode người gửi để hiển thị badge (GV/HV/Staff)
    let sender = onlineUsers.get(`${data.senderRole}_${data.senderId}`);
    if (!sender && (data.senderRole === 'admin' || data.senderRole === 'staff')) {
      const altRole = data.senderRole === 'admin' ? 'staff' : 'admin';
      sender = onlineUsers.get(`${altRole}_${data.senderId}`);
    }
    const sBranch = sender?.branchCode || '';
    const rBranch = receiver?.branchCode || '';

    // Chuẩn hoá payload trước khi gửi (giống messageRoutes.js)
    const finalSenderId = ((data.senderRole === 'admin' || data.senderRole === 'staff') && data.receiverRole === 'student') ? 'admin' : data.senderId;
    const finalSenderName = ((data.senderRole === 'admin' || data.senderRole === 'staff') && data.receiverRole === 'student') ? 'Phòng Giáo Vụ' : data.senderName;
    
    const finalReceiverId = isOneSideAdmin && isOneSideStudent && (data.receiverRole === 'admin' || data.receiverRole === 'staff') ? 'admin' : data.receiverId;
    const finalReceiverName = isOneSideAdmin && isOneSideStudent && (data.receiverRole === 'admin' || data.receiverRole === 'staff') ? 'Phòng Giáo Vụ' : data.receiverName;

    const msgPayload = {
      ...data,
      _id: data._id || `msg_${Date.now()}`,
      senderId: finalSenderId,
      senderName: finalSenderName,
      receiverId: finalReceiverId,
      receiverName: finalReceiverName,
      conversationId: convId,
      senderBranchCode: sBranch,
      receiverBranchCode: rBranch,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    // 1. Xử lý Broadcast (nếu có)
    if (data.receiverId === 'ALL_USERS') {
      io.emit('message:receive', msgPayload);
    } else if (data.receiverId === 'ALL_STUDENTS') {
      io.to('ALL_STUDENT').emit('message:receive', msgPayload);
    } else if (data.receiverId === 'ALL_TEACHERS') {
      io.to('ALL_TEACHER').emit('message:receive', msgPayload);
    } else if (data.receiverId?.startsWith('ALL_BRANCH_')) {
      const bCode = data.receiverId.replace('ALL_BRANCH_', '');
      // Gửi cho ALL_STUDENT_branchCode và ALL_TEACHER_branchCode và ALL_STAFF_branchCode
      io.to(`ALL_STUDENT_${bCode}`).to(`ALL_TEACHER_${bCode}`).to(`ALL_STAFF_${bCode}`).emit('message:receive', msgPayload);
    }
    // 2. Gửi cho người nhận cụ thể (nếu là student)
    else if (data.receiverRole === 'student' && receiver && receiver.socketId) {
      io.to(receiver.socketId).emit('message:receive', msgPayload);
    } 
    
    // 3. Nếu người nhận là admin/staff -> Gửi cho TẤT CẢ admin và staff
    if (data.receiverRole === 'admin' || data.receiverRole === 'staff') {
      io.to('ALL_ADMIN').to('ALL_STAFF').emit('message:receive', msgPayload);
    }

    // 4. Nếu người gửi là admin/staff -> Gửi cho TẤT CẢ admin và staff khác (để đồng bộ)
    if (data.senderRole === 'admin' || data.senderRole === 'staff') {
      io.to('ALL_ADMIN').to('ALL_STAFF').emit('message:receive', msgPayload);
    }

    // 5. Gửi confirm cho chính người gửi
    socket.emit('message:sent', msgPayload);
  });

  // ── Đánh dấu đã đọc ──
  socket.on('message:read', ({ conversationId, readerId }) => {
    // Broadcast cho tất cả participants
    io.emit('message:read_ack', { conversationId, readerId });
  });

  // ── Đán dấu đang gõ ──
  socket.on('typing:start', ({ conversationId, userId, userName }) => {
    socket.broadcast.emit('typing:show', { conversationId, userId, userName });
  });
  socket.on('typing:stop', ({ conversationId, userId }) => {
    socket.broadcast.emit('typing:hide', { conversationId, userId });
  });

  // ── Nhận report vi phạm thi ──
  socket.on('exam:violation', (data) => {
    // data = { studentId, studentName, teacherId, course, reason }
    const notif = {
      type: 'violation',
      title: '🚨 Vi phạm Giám Sát Thi',
      message: `Học viên ${data.studentName} đã vi phạm (${data.reason}) bài thi ${data.course}. Tài khoản đã bị khóa quyền thi.`,
      date: new Date().toISOString()
    };

    // Broadcast tới tất cả Admin & Giảng viên qua NotificationService
    const NotificationService = require('./services/NotificationService');
    
    // 1. Gửi cho tất cả Admin
    NotificationService.send(io, {
      type: 'EXAM',
      title: notif.title,
      content: notif.message,
      receivers: 'ALL_ADMIN',
      payload: data,
      link: '/admin#students'
    });

    // 2. Gửi cho Giáo viên phụ trách
    if (data.teacherId) {
      NotificationService.send(io, {
        type: 'EXAM',
        title: notif.title,
        content: notif.message,
        receivers: data.teacherId.toString(),
        payload: data,
        link: '/teacher'
      });
    }
     // (Removed io.emit('exam:locked') to prevent INFINITE LOOP with StudentTest resolving 'exam:locked' by emitting 'exam:violation')
  });

  // ── Giảng viên join room riêng để nhận notify ──
  socket.on('teacher:join', ({ teacherId }) => {
    socket.join(`teacher_${teacherId}`);
    console.log(`👨‍🏫 Teacher ${teacherId} joined room teacher_${teacherId}`);
  });

  // ── Học viên join room riêng ──
  socket.on('student:join', ({ studentId }) => {
    socket.join(`student_${studentId}`);
    console.log(`🎓 Student ${studentId} joined room student_${studentId}`);
  });

  // ── Admin join room ──
  socket.on('admin:join', () => {
    socket.join('admin_room');
    console.log(`🛡️  Admin joined admin_room`);
  });

  // ── Nhóm chat ──
  socket.on('group:join', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`💬 Socket ${socket.id} joined group_${groupId}`);
  });

  // ── Client xác nhận nhận được exam:unlocked ──
  socket.on('exam:unlock_ack', ({ studentId }) => {
    console.log(`✅ [ACK] Học viên ${studentId} đã nhận thông báo unlock thi`);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    for (const [key, val] of onlineUsers.entries()) {
      if (val.socketId === socket.id) {
        // Lưu thời điểm offline để frontend tính "X phút trước"
        lastSeenMap.set(String(val.userId), new Date().toISOString());
        onlineUsers.delete(key);
        break;
      }
    }
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      userId: u.userId, role: u.role, name: u.name, connectedAt: u.connectedAt
    })));
    // Broadcast lastSeen map để frontend cập nhật
    io.emit('users:lastSeen', Object.fromEntries(lastSeenMap));
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// ── Hàm gửi notification real-time ──
app.notifyUser = (role, userId, eventName, data) => {
  const strUserId = String(userId);
  
  if (strUserId === 'admin') {
    // Nếu gửi cho admin (tài khoản hardcode hệ thống), phát cho tất cả admin và staff
    io.to('ALL_ADMIN').emit(eventName, data);
    io.to('ALL_STAFF').emit(eventName, data);
    return true;
  }

  let key = `${role}_${strUserId}`;
  let user = onlineUsers.get(key);
  
  if (!user && (role === 'admin' || role === 'staff')) {
    const altRole = role === 'admin' ? 'staff' : 'admin';
    user = onlineUsers.get(`${altRole}_${strUserId}`);
  }
  
  if (user) {
    io.to(user.socketId).emit(eventName, data);
    return true;
  }
  
  // Fallback: Nếu không tìm thấy role_id, thử join room theo userId
  io.to(strUserId).emit(eventName, data);
  return true;
};

// ── Broadcast cho tất cả user có role nhất định ──
app.broadcastToRole = (role, eventName, data) => {
  for (const [key, val] of onlineUsers.entries()) {
    if (val.role === role) {
      io.to(val.socketId).emit(eventName, data);
    }
  }
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

app.use('/api/auth',         authRoutes);
app.use('/api/students',     studentRoutes);
app.use('/api/invoices',     invoiceRoutes);
app.use('/api/messages',     messageRoutes);
app.use('/api/schedules',    scheduleRoutes);
app.use('/api/courses',      courseRoutes);
app.use('/api/teachers',     teacherRoutes);
app.use('/api/assignments',  assignmentRoutes);
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




// Route mặc định
app.get('/', (req, res) => {
  res.json({
    message: 'QUANLYCMS API - Trung tam Thang Tin Hoc',
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
// CRON JOB: Nhắc lịch học tự động
// ==========================================
// const Schedule = require('./models/Schedule');
// const nodemailer = require('nodemailer');
//
// Chạy mỗi 10 phút - kiểm tra lịch sắp tới và gửi nhắc nhở
cron.schedule('*/10 * * * *', async () => {
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

server.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'QUANLYCMS server listening');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  try {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await mongoose.connection.close(false);
    await tokenBlacklist.close();
  } catch (e) {
    logger.error(e);
  }
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io };
