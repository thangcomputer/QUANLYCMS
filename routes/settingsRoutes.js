const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const SystemSettings = require('../models/SystemSettings');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const logger = require('../config/logger');

// ── Multer config cho upload banner popup ─────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'popup');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `popup_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ cho phép file ảnh'));
  },
});

// Helper: get or create singleton settings document
async function getSettings() {
  let settings = await SystemSettings.findOne({ _key: 'main' });
  if (!settings) {
    settings = await SystemSettings.create({ _key: 'main' });
  }
  return settings;
}

// ── GET /api/settings/bank ─────────────────────────────────── (Public - chỉ bank info)
// Chỉ trả thông tin ngân hàng để hiển thị QR - an toàn public
router.get('/bank', async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      data: {
        centerBankCode:          settings.centerBankCode          || '',
        centerBankName:          settings.centerBankName          || '',
        centerBankAccountNumber: settings.centerBankAccountNumber || '',
        centerBankAccountName:   settings.centerBankAccountName   || '',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET /api/settings ─────────────────────────────────────────── (Admin only)
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────── (Admin only)
router.put('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const allowed = [
      'popupIsActive', 'popupTitle', 'popupContent', 'popupImageUrl', 'popupTargetRole',
      'invoiceLogoUrl', 'invoiceSignatureUrl', 'invoiceStampText',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const settings = await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: updates },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: settings, message: 'Đã lưu cấu hình' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── POST /api/settings/upload-popup-image ── Upload banner popup ─────────────
router.post('/upload-popup-image', authMiddleware, isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    const imageUrl = `/uploads/popup/${req.file.filename}`;

    // Lưu URL vào settings
    await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { popupImageUrl: imageUrl } },
      { upsert: true }
    );

    return res.json({ success: true, imageUrl, message: 'Upload thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/settings/upload-invoice-signature ── Upload chữ ký hóa đơn ─────────
const sigDir = path.join(__dirname, '..', 'uploads', 'signature');
if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

const sigStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, sigDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `signature_${Date.now()}${ext}`);
  },
});
const uploadSig = multer({
  storage: sigStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ cho phép file ảnh'));
  },
});

router.post('/upload-invoice-signature', authMiddleware, isAdmin, uploadSig.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    const signatureUrl = `/uploads/signature/${req.file.filename}`;

    await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { invoiceSignatureUrl: signatureUrl } },
      { upsert: true }
    );

    return res.json({ success: true, signatureUrl, message: 'Upload chữ ký thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/settings/popup ──── Public (Student & Teacher gọi khi login) ─────
router.get('/popup', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      data: {
        isActive: settings.popupIsActive,
        title: settings.popupTitle,
        content: settings.popupContent,
        imageUrl: settings.popupImageUrl,
        targetRole: settings.popupTargetRole,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET /api/settings/payment ── PUBLIC — Lấy thông tin ngân hàng trung tâm ──
// Không cần auth: trang đăng ký học viên mới gọi endpoint này mà không có token
router.get('/payment', async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      data: {
        bankCode:      settings.centerBankCode      || '',
        bankName:      settings.centerBankName      || '',
        accountNumber: settings.centerBankAccountNumber || '',
        accountName:   settings.centerBankAccountName   || '',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET /api/settings/web ── PUBLIC — Logo, Loading style, Staff popup ────────
// Frontend gọi ngay khi khởi tạo App để render loading screen + logo
router.get('/web', async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      data: {
        logoUrl:      settings.logoUrl      || '',
        loadingStyle: settings.loadingStyle || 1,
        staffPopup: {
          isActive:  settings.staffPopup?.isActive  || false,
          title:     settings.staffPopup?.title     || '',
          content:   settings.staffPopup?.content   || '',
          updatedAt: settings.staffPopup?.updatedAt || null,
        },
        invoiceLogoUrl:      settings.invoiceLogoUrl      || '',
        invoiceSignatureUrl: settings.invoiceSignatureUrl || '',
        invoiceStampText:    settings.invoiceStampText    || 'ĐÃ THANH TOÁN',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PUT /api/settings/web ── Admin only — Cập nhật cài đặt web ───────────────
router.put('/web', authMiddleware, isAdmin, async (req, res) => {
  try {
    const updates = {};
    const { logoUrl, loadingStyle, staffPopup } = req.body;

    if (logoUrl !== undefined)      updates.logoUrl = logoUrl;
    if (loadingStyle !== undefined)  updates.loadingStyle = Math.max(1, Math.min(4, Number(loadingStyle) || 1));

    if (staffPopup) {
      updates['staffPopup.isActive']  = staffPopup.isActive ?? false;
      updates['staffPopup.title']     = staffPopup.title    ?? '';
      updates['staffPopup.content']   = staffPopup.content  ?? '';
      updates['staffPopup.updatedAt'] = new Date();
    }

    const settings = await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: updates },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: settings, message: 'Đã lưu cấu hình Web' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── GET /api/settings/training-data ── Lấy training data (Cho mọi user) ───────────
router.get('/training-data', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    const data = settings.trainingRawData || { videos: [], guides: [], files: [] };
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PUT /api/settings/training-data ── Cập nhật training data (Admin) ─────────────
router.put('/training-data', authMiddleware, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { trainingRawData: req.body.trainingData } },
      { upsert: true, new: true }
    );
    // Broadcast via socket that training data was updated
    const io = req.app.get('io');
    if (io) io.emit('data:refresh');

    return res.json({ success: true, message: 'Đã cập nhật training data' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/settings/student-training-data ── Lấy student training data (Cho mọi user) ───────────
router.get('/student-training-data', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    const data = settings.studentTrainingRawData || { videos: [], guides: [], files: [] };
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PUT /api/settings/student-training-data ── Cập nhật student training data (Admin) ─────────────
router.put('/student-training-data', authMiddleware, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { studentTrainingRawData: req.body.studentTrainingData } },
      { upsert: true, new: true }
    );
    // Broadcast via socket that data was updated
    const io = req.app.get('io');
    if (io) io.emit('data:refresh');

    return res.json({ success: true, message: 'Đã cập nhật dữ liệu học viên' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

const DEFAULT_EXAM_MINUTES_SERVER = { coban: 90, word: 90, excel: 90, powerpoint: 90 };

function sanitizeStudentExamMinutesPayload(body) {
  const out = { ...DEFAULT_EXAM_MINUTES_SERVER };
  if (!body || typeof body !== 'object') return out;
  for (const k of Object.keys(DEFAULT_EXAM_MINUTES_SERVER)) {
    const n = Number(body[k]);
    if (Number.isFinite(n) && n >= 1 && n <= 600) out[k] = Math.round(n);
  }
  return out;
}

// ── GET /api/settings/student-exam-config ── Ngân hàng TN HV + phút làm bài (mọi role đăng nhập)
router.get('/student-exam-config', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    const bank = settings.studentExamBankRawData;
    const hasStudentExamBank = bank != null;
    const minsRaw = settings.studentExamMinutesRaw;
    const hasMinutesOnServer = minsRaw != null && typeof minsRaw === 'object';
    return res.json({
      success: true,
      data: {
        hasStudentExamBank,
        studentQuestions: hasStudentExamBank && Array.isArray(bank) ? bank : [],
        studentExamMinutes: hasMinutesOnServer ? sanitizeStudentExamMinutesPayload(minsRaw) : undefined,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

function sanitizeTeacherExamTimeLimitMinutes(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 5 || rounded > 600) return null;
  return rounded;
}

// ── GET /api/settings/teacher-exam-config ── Ngân hàng câu hỏi thi GV (mọi role đăng nhập — chỉ GV cần)
router.get('/teacher-exam-config', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    const bank = settings.teacherExamBankRawData;
    const hasTeacherExamBank = bank != null;
    const tm = settings.teacherExamTimeLimitMinutes;
    const timeLimitMinutes =
      tm != null && Number.isFinite(Number(tm)) ? sanitizeTeacherExamTimeLimitMinutes(tm) : null;
    return res.json({
      success: true,
      data: {
        hasTeacherExamBank,
        questions: hasTeacherExamBank && Array.isArray(bank) ? bank : [],
        timeLimitMinutes,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PUT /api/settings/teacher-exam-config ── Admin/Staff lưu ngân hàng thi GV (+ phút làm bài tùy chọn)
router.put('/teacher-exam-config', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { questions, timeLimitMinutes } = req.body || {};
    const $set = {};
    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ success: false, message: 'questions phải là mảng' });
      }
      $set.teacherExamBankRawData = questions;
    }
    if (timeLimitMinutes !== undefined) {
      if (timeLimitMinutes === null || timeLimitMinutes === '') {
        $set.teacherExamTimeLimitMinutes = null;
      } else {
        const n = sanitizeTeacherExamTimeLimitMinutes(timeLimitMinutes);
        if (n === null) {
          return res.status(400).json({
            success: false,
            message: 'timeLimitMinutes phải từ 5 đến 600 (phút), hoặc null để tự động',
          });
        }
        $set.teacherExamTimeLimitMinutes = n;
      }
    }
    if (Object.keys($set).length === 0) {
      return res.status(400).json({ success: false, message: 'Cần questions và/hoặc timeLimitMinutes' });
    }
    await SystemSettings.findOneAndUpdate({ _key: 'main' }, { $set }, { upsert: true, new: true });
    const io = req.app.get('io');
    if (io) io.emit('data:refresh');
    return res.json({ success: true, message: 'Đã lưu cấu hình thi giảng viên' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/settings/student-exam-config ── Admin/Staff lưu ngân hàng + thời gian thi HV
router.put('/student-exam-config', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { studentQuestions, studentExamMinutes } = req.body || {};
    const updates = {};
    if (studentQuestions !== undefined) {
      if (!Array.isArray(studentQuestions)) {
        return res.status(400).json({ success: false, message: 'studentQuestions phải là mảng' });
      }
      updates.studentExamBankRawData = studentQuestions;
    }
    if (studentExamMinutes !== undefined) {
      updates.studentExamMinutesRaw = sanitizeStudentExamMinutesPayload(studentExamMinutes);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để lưu' });
    }
    await SystemSettings.findOneAndUpdate({ _key: 'main' }, { $set: updates }, { upsert: true, new: true });
    const io = req.app.get('io');
    if (io) io.emit('data:refresh');
    return res.json({ success: true, message: 'Đã lưu cấu hình thi học viên' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/settings/upload-training-file ── Tài liệu đào tạo GV/HV (Admin) ──
const trainingDir = path.join(__dirname, '..', 'uploads', 'training');
if (!fs.existsSync(trainingDir)) fs.mkdirSync(trainingDir, { recursive: true });

const ALLOWED_TRAINING_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar',
]);

const trainingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, trainingDir),
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = ALLOWED_TRAINING_EXT.has(rawExt) ? rawExt : '';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `training-${uniqueSuffix}${ext}`);
  },
});

const uploadTraining = multer({
  storage: trainingStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_TRAINING_EXT.has(ext)) {
      return cb(new Error('Chỉ cho phép PDF, Word, Excel, PowerPoint, ZIP, RAR.'));
    }
    cb(null, true);
  },
});

router.post('/upload-training-file', authMiddleware, isAdmin, (req, res) => {
  uploadTraining.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File quá lớn (tối đa 25MB).' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Lỗi upload' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/training/${req.file.filename}`;
    return res.json({ success: true, fileUrl, message: 'Tải tài liệu thành công' });
  });
});

// ── POST /api/settings/upload-logo ── Upload logo thương hiệu ────────────────
const logoDir = path.join(__dirname, '..', 'uploads', 'logo');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo_${Date.now()}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ cho phép file ảnh'));
  },
});

router.post('/upload-logo', authMiddleware, isAdmin, uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    const logoUrl = `/uploads/logo/${req.file.filename}`;
    await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { logoUrl } },
      { upsert: true }
    );
    return res.json({ success: true, logoUrl, message: 'Upload logo thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/settings/upload-invoice-logo ── Upload logo dành riêng cho hóa đơn ──
const invLogoDir = path.join(__dirname, '..', 'uploads', 'invoice_logo');
if (!fs.existsSync(invLogoDir)) fs.mkdirSync(invLogoDir, { recursive: true });

const invLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, invLogoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `inv_logo_${Date.now()}${ext}`);
  },
});
const uploadInvLogo = multer({
  storage: invLogoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ cho phép file ảnh'));
  },
});

router.post('/upload-invoice-logo', authMiddleware, isAdmin, uploadInvLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });
    const logoUrl = `/uploads/invoice_logo/${req.file.filename}`;
    await SystemSettings.findOneAndUpdate(
      { _key: 'main' },
      { $set: { invoiceLogoUrl: logoUrl } },
      { upsert: true }
    );
    return res.json({ success: true, logoUrl, message: 'Upload logo hóa đơn thành công' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/settings/reset-data ── Làm mới dữ liệu hệ thống (Super Admin) ──
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Schedule = require('../models/Schedule');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Message = require('../models/Message');
const SystemLog = require('../models/SystemLog');
const Notification = require('../models/Notification');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Evaluation = require('../models/Evaluation');
const ExamResult = require('../models/ExamResult');
const Group = require('../models/Group');
const ConversationVisibility = require('../models/ConversationVisibility');
const PayrollLog = require('../models/PayrollLog');
const Employee = require('../models/Employee');
const mongoose = require('mongoose');

router.post('/reset-data', authMiddleware, isAdmin, async (req, res) => {
  const { phrase, password, options = { all: true } } = req.body;
  const userId = req.user.id;

  if (phrase !== 'XOA_DU_LIEU') {
    return res.status(400).json({ success: false, message: 'Chuỗi xác nhận không hợp lệ' });
  }

  try {
    // 1. Xác thực Super Admin — kiểm tra từ DB (SystemSettings) thay vì hardcode
    if (userId === 'admin') {
      const bcrypt = require('bcryptjs');
      const sysSettings = await SystemSettings.findOne({ _key: 'main' });
      const storedHash = sysSettings?.adminPasswordHash || '';
      let pwMatch = false;
      if (storedHash) {
        pwMatch = await bcrypt.compare(password, storedHash);
      } else {
        pwMatch = (password === 'admin123'); // Chỉ dùng khi chưa đổi MK lần nào
      }
      if (!pwMatch) {
        return res.status(400).json({ success: false, message: 'Mật khẩu Super Admin không đúng' });
      }
    } else {
      const adminUser = await Teacher.findById(userId).select('+password');
      if (!adminUser || adminUser.adminRole !== 'SUPER_ADMIN') {
        return res.status(400).json({ success: false, message: 'Chỉ Super Admin mới có quyền thao tác này' });
      }
      const isMatch = await adminUser.comparePassword(password);
      if (!isMatch) {
         return res.status(400).json({ success: false, message: 'Mật khẩu Super Admin không đúng' });
      }
    }

    // 2. Thực hiện xóa theo tùy chọn
    const isAll = options.all === true;
    
    // NHÓM: HỌC VIÊN
    if (isAll || options.students) {
      await Student.deleteMany({});
      await ExamResult.deleteMany({});
      await Submission.deleteMany({});
      await Evaluation.deleteMany({});
      await Assignment.deleteMany({});
    }

    // NHÓM: TÀI CHÍNH
    if (isAll || options.finance) {
      await Transaction.deleteMany({});
      await Invoice.deleteMany({});
      await PayrollLog.deleteMany({});
    }

    // NHÓM: LỊCH DẠY
    if (isAll || options.schedules) {
      await Schedule.deleteMany({});
    }

    // NHÓM: TIN NHẮN & THÔNG BÁO
    if (isAll || options.communication) {
      await Message.deleteMany({});
      await Notification.deleteMany({});
      await Group.deleteMany({});
      await ConversationVisibility.deleteMany({});
    }

    // NHÓM: NHÂN SỰ (STAFF)
    if (isAll || options.hr) {
      await Employee.deleteMany({});
    }

    // NHÓM: LOGS
    if (isAll || options.logs) {
      await SystemLog.deleteMany({});
    }
    
    // NHÓM 2 - DỮ LIỆU GIỮ NGUYÊN
    // Không bao giờ xóa: Teacher (Users), SystemSettings, Branch, Course.
    
    // Auto-unlock tất cả giáo viên
    await Teacher.updateMany({}, { $set: { isLocked: false, loginAttempts: 0, lockReason: null } });

    // 3. Thông báo cho Socket
    const io = req.app.get('io');
    if (io) {
       io.emit('SYSTEM_RESET');
    }

    return res.json({ success: true, message: 'Làm mới dữ liệu hệ thống thành công' });

  } catch (err) {
    logger.error('[RESET DATA ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi server khi reset data: ' + err.message });
  }
});

module.exports = router;
