const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const compression = require('compression'); // ⚡ Gzip compress API responses
const helmet     = require('helmet');       // ✅ HTTP security headers
const dotenv     = require('dotenv');
const { Server } = require('socket.io');
const cron       = require('node-cron');
const connectDB  = require('./config/db');

// Load biến môi trường
dotenv.config();

// Khởi tạo Express + HTTP Server + Socket.io
const app    = express();
const server = http.createServer(app);

// Cấu hình các domain được phép truy cập (CORS)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL, // Thêm domain server từ .env
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: ['GET', 'POST'],
  },
});

// ==========================================
// MIDDLEWARE
// ==========================================
// ⚡ Gzip compression — giảm payload size 60-70%
app.use(compression({ level: 6, threshold: 1024 }));

// ✅ Helmet — thêm các HTTP security headers tự động
app.use(helmet({
  contentSecurityPolicy: false, // tắt CSP vì có inline scripts trong upload
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // cho phép serve /uploads
}));

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(require('passport').initialize()); // Social OAuth

// Serve uploaded files với cache 1 ngày (tăng tốc load ảnh)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static('uploads'));

// Gắn io vào app để dùng trong routes
app.set('io', io);
global.io = io; // Đảm bảo global.io luôn khả dụng cho các route

// Log mọi hoạt động thay đổi dữ liệu
const systemLogger = require('./middleware/systemLogger');
app.use(systemLogger);

// ==========================================
// KẾT NỐI DATABASE
// ==========================================
connectDB();

// ==========================================
// SOCKET.IO - REAL-TIME
// ==========================================
const onlineUsers = new Map();  // { key: { socketId, userId, role, name, branchId, connectedAt } }
const lastSeenMap = new Map();  // { userId: ISO timestamp } — lưu khi disconnect

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Đăng ký user online
  socket.on('register', ({ userId, role, name, branchId }) => {
    const key = `${role}_${userId}`;
    onlineUsers.set(key, { socketId: socket.id, userId, role, name, branchId, connectedAt: new Date().toISOString() });
    console.log(`👤 Online: ${name} (${role}) - ${key}`);

    // Join rooms for Centralized Notification Service
    socket.join(userId);           // Unique user room
    socket.join('GLOBAL');          // Global room
    
    if (role) {
      socket.join(`ALL_${role.toUpperCase()}`); // e.g., ALL_ADMIN, ALL_TEACHER
      if (branchId) {
        socket.join(`ALL_${role.toUpperCase()}_${branchId}`); 
      }
    }

    // Broadcast danh sách online
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      userId: u.userId, role: u.role, name: u.name, branchId: u.branchId, connectedAt: u.connectedAt
    })));
  });

  // ── Nhắn tin 1-1 ──
  socket.on('message:send', (data) => {
    // data = { senderId, senderName, senderRole, receiverId, receiverRole, content }
    const receiverKey = `${data.receiverRole}_${data.receiverId}`;
    const receiver = onlineUsers.get(receiverKey);

    // Tính conversationId theo cùng logic sort như client DataContext
    const convId = data.isGroup && data.groupId
      ? `group_${data.groupId}`
      : [`${data.senderRole}_${data.senderId}`, `${data.receiverRole}_${data.receiverId}`].sort().join('__');

    const msgPayload = {
      ...data,
      _id: `msg_${Date.now()}`,
      conversationId: convId,    // ⭑ Quan trọng: để Inbox match đúng conversation
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    // Gửi cho người nhận nếu online
    if (receiver) {
      io.to(receiver.socketId).emit('message:receive', msgPayload);
    }

    // Gửi lại cho người gửi (confirm)
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
      link: '/admin/students'
    });

    // 2. Gửi cho Giáo viên phụ trách
    if (data.teacherId) {
      NotificationService.send(io, {
        type: 'EXAM',
        title: notif.title,
        content: notif.message,
        receivers: data.teacherId.toString(),
        payload: data,
        link: '/teacher/dashboard'
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
  const key = `${role}_${userId}`;
  const user = onlineUsers.get(key);
  if (user) {
    io.to(user.socketId).emit(eventName, data);
    return true;
  }
  return false;
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

    console.log(`⏰ [CRON] Kiểm tra lịch học: ${new Date().toLocaleTimeString('vi-VN')}`);
  } catch (err) {
    console.error('[CRON] Lỗi kiểm tra lịch:', err.message);
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
  console.error('Server Error:', err.stack);

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

server.listen(PORT, () => {
  console.log('==========================================');
  console.log(`  🚀 QUANLYCMS Server v2.0`);
  console.log(`  📡 Socket.io: ACTIVE`);
  console.log(`  🏫 Trung tâm Thắng Tin Học`);
  console.log(`  🌐 Port: ${PORT}`);
  console.log(`  ⚙  Env: ${process.env.NODE_ENV || 'development'}`);
  console.log('==========================================');
});

module.exports = { app, server, io };
