/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUANLYCMS — Cleanup Test Accounts
 *  Xóa tất cả tài khoản test khỏi DB sau khi kiểm thử xong
 *  Chạy: node tests/cleanup_test_accounts.js
 * ═══════════════════════════════════════════════════════════════════════
 */
const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Student  = require('../models/Student');
const Teacher  = require('../models/Teacher');
const ExamResult = require('../models/ExamResult');

async function cleanup() {
  console.log('🧹 Cleaning up test accounts...');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const deletedStudents = await Student.deleteMany({
    $or: [
      { name: { $regex: /^HỌC VIÊN TEST/ } },
      { phone: { $regex: /^0900000/ } },
    ]
  });

  const deletedTeachers = await Teacher.deleteMany({
    $or: [
      { name: { $regex: /^(GIẢNG VIÊN TEST|ADMIN CHI NHÁNH TEST)/ } },
      { phone: { $regex: /^091000|^092000/ } },
    ]
  });

  // Clean up test exam results
  const deletedExams = await ExamResult.deleteMany({
    studentId: { $regex: /^test_vu_/ },
  });

  console.log(`🗑️  Deleted: ${deletedStudents.deletedCount} students, ${deletedTeachers.deletedCount} teachers/admins, ${deletedExams.deletedCount} exam results`);

  await mongoose.disconnect();
  console.log('✅ Cleanup completed');
}

cleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
