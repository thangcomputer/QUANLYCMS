/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUANLYCMS — Test Configuration
 *  Cấu hình chung cho Load Test & E2E Test
 * ═══════════════════════════════════════════════════════════════════════
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

// ── URLs ──────────────────────────────────────────────────────────────────
const BASE_URL     = process.env.CLIENT_URL || 'http://localhost:5173';
const API_BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ── JWT Helper: Tạo token cho các tài khoản test ─────────────────────────
function generateTestToken(payload, audience = 'public') {
  return jwt.sign(
    { ...payload, aud: audience },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// ── Định nghĩa các tài khoản test ─────────────────────────────────────────
// Sẽ được seed vào DB bởi seed_test_accounts.js
const TEST_ACCOUNTS = {
  // 10 Học viên
  students: Array.from({ length: 10 }, (_, i) => ({
    name:     `HỌC VIÊN TEST ${String(i + 1).padStart(2, '0')}`,
    phone:    `09000000${String(i + 10).padStart(2, '0')}`,
    zalo:     `09000000${String(i + 10).padStart(2, '0')}`,
    password: 'Test@123',
    course:   'Tin Học Văn Phòng',
    price:    2000000,
    status:   'active',
    role:     'student',
    totalSessions: 12,
    paid:     true,
    studentExamUnlocked: true,
  })),

  // 5 Giảng viên
  teachers: Array.from({ length: 5 }, (_, i) => ({
    name:      `GIẢNG VIÊN TEST ${String(i + 1).padStart(2, '0')}`,
    phone:     `09100000${String(i + 10).padStart(2, '0')}`,
    password:  'Test@123',
    specialty: 'Tin Học Văn Phòng',
    status:    'active',
    role:      'teacher',
  })),

  // 5 Admin chi nhánh
  admins: Array.from({ length: 5 }, (_, i) => ({
    name:        `ADMIN CHI NHÁNH TEST ${String(i + 1).padStart(2, '0')}`,
    phone:       `09200000${String(i + 10).padStart(2, '0')}`,
    password:    'Test@123',
    specialty:   'Quản Trị',
    status:      'active',
    role:        'admin',
    adminRole:   'STAFF',
    permissions: ['manage_students', 'manage_schedule', 'manage_finance'],
  })),
};

// ── Thông số kiểm thử ─────────────────────────────────────────────────────
const TEST_CONFIG = {
  // Kịch bản 1: Concurrency Test
  concurrency: {
    duration:    5 * 60 * 1000,  // 5 phút
    tabSwitchInterval: 3000,     // Chuyển tab mỗi 3 giây
    apiTimeout:  5000,           // Timeout API 5 giây
    maxDelay:    2000,           // Ngưỡng delay tối đa chấp nhận được (ms)
  },

  // Kịch bản 2: Exam Stress Test
  examStress: {
    numStudents: 5,
    answerInterval:   1500,      // Click đáp án mỗi 1.5 giây
    tabSwitchCount:   10,        // Số lần chuyển tab
    tabSwitchPause:   2000,      // Thời gian ở tab khác (ms)
    submitDelay:      500,       // Delay giữa các lần nộp bài đồng loạt
  },

  // Viewport cho chia nhỏ cửa sổ
  viewports: {
    small:  { width: 640,  height: 480 },
    medium: { width: 800,  height: 600 },
    large:  { width: 1024, height: 768 },
  },
};

module.exports = {
  BASE_URL,
  API_BASE_URL,
  generateTestToken,
  TEST_ACCOUNTS,
  TEST_CONFIG,
};
