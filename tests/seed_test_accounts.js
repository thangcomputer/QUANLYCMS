/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUANLYCMS — Seed Test Accounts
 *  Tạo 20 tài khoản test vào MongoDB: 10 HV + 5 GV + 5 Admin chi nhánh
 *  Chạy: node tests/seed_test_accounts.js
 * ═══════════════════════════════════════════════════════════════════════
 */
const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const Student  = require('../models/Student');
const Teacher  = require('../models/Teacher');
const { TEST_ACCOUNTS } = require('./config');

async function seed() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🌱 SEED TEST ACCOUNTS — QUANLYCMS');
  console.log('═══════════════════════════════════════════════');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // ── Cleanup trước ──────────────────────────────────────────────
  const cleanupPhones = [
    ...TEST_ACCOUNTS.students.map(s => s.phone),
    ...TEST_ACCOUNTS.teachers.map(t => t.phone),
    ...TEST_ACCOUNTS.admins.map(a => a.phone),
  ];
  const cleanupZalos = TEST_ACCOUNTS.students.map(s => s.zalo);

  const deletedStudents = await Student.deleteMany({
    $or: [
      { phone: { $in: cleanupPhones } },
      { zalo:  { $in: cleanupZalos } },
      { name:  { $regex: /^HỌC VIÊN TEST/ } },
    ]
  });
  const deletedTeachers = await Teacher.deleteMany({
    $or: [
      { phone: { $in: cleanupPhones } },
      { name:  { $regex: /^(GIẢNG VIÊN TEST|ADMIN CHI NHÁNH TEST)/ } },
    ]
  });

  console.log(`🧹 Cleaned: ${deletedStudents.deletedCount} students, ${deletedTeachers.deletedCount} teachers/admins`);

  // ── Tạo Học Viên ──────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Test@123', 10);

  const studentDocs = TEST_ACCOUNTS.students.map(s => ({
    ...s,
    password: hashedPassword,
  }));
  const createdStudents = await Student.insertMany(studentDocs, { ordered: false }).catch(e => {
    console.warn('⚠️ Some students already exist, skipping duplicates');
    return e.insertedDocs || [];
  });
  console.log(`👨‍🎓 Created ${Array.isArray(createdStudents) ? createdStudents.length : 'some'} test students`);

  // ── Tạo Giảng Viên ───────────────────────────────────────────
  const teacherDocs = TEST_ACCOUNTS.teachers.map(t => ({
    ...t,
    password: hashedPassword,
  }));
  const createdTeachers = await Teacher.insertMany(teacherDocs, { ordered: false }).catch(e => {
    console.warn('⚠️ Some teachers already exist, skipping duplicates');
    return e.insertedDocs || [];
  });
  console.log(`👨‍🏫 Created ${Array.isArray(createdTeachers) ? createdTeachers.length : 'some'} test teachers`);

  // ── Tạo Admin Chi Nhánh ───────────────────────────────────────
  const adminDocs = TEST_ACCOUNTS.admins.map(a => ({
    ...a,
    password: hashedPassword,
  }));
  const createdAdmins = await Teacher.insertMany(adminDocs, { ordered: false }).catch(e => {
    console.warn('⚠️ Some admins already exist, skipping duplicates');
    return e.insertedDocs || [];
  });
  console.log(`🛡️  Created ${Array.isArray(createdAdmins) ? createdAdmins.length : 'some'} test branch admins`);

  // ── Verify ────────────────────────────────────────────────────
  const verifyStudents = await Student.find({ name: { $regex: /^HỌC VIÊN TEST/ } }).select('name phone zalo').lean();
  const verifyTeachers = await Teacher.find({ name: { $regex: /^GIẢNG VIÊN TEST/ } }).select('name phone role').lean();
  const verifyAdmins   = await Teacher.find({ name: { $regex: /^ADMIN CHI NHÁNH TEST/ } }).select('name phone role adminRole').lean();

  console.log('\n═══ VERIFICATION ═══');
  console.log(`Students:  ${verifyStudents.length}/10`);
  verifyStudents.forEach(s => console.log(`  📗 ${s.name} | phone: ${s.phone} | _id: ${s._id}`));

  console.log(`Teachers:  ${verifyTeachers.length}/5`);
  verifyTeachers.forEach(t => console.log(`  📘 ${t.name} | phone: ${t.phone} | _id: ${t._id}`));

  console.log(`Admins:    ${verifyAdmins.length}/5`);
  verifyAdmins.forEach(a => console.log(`  📕 ${a.name} | phone: ${a.phone} | role: ${a.adminRole} | _id: ${a._id}`));

  // ── Xuất danh sách ID để dùng trong test ─────────────────────
  const accountMap = {
    students: verifyStudents.map(s => ({ _id: s._id.toString(), name: s.name, phone: s.phone })),
    teachers: verifyTeachers.map(t => ({ _id: t._id.toString(), name: t.name, phone: t.phone })),
    admins:   verifyAdmins.map(a => ({ _id: a._id.toString(), name: a.name, phone: a.phone })),
  };

  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'test_account_ids.json'),
    JSON.stringify(accountMap, null, 2),
    'utf-8'
  );
  console.log('\n✅ Account IDs saved to tests/test_account_ids.json');

  await mongoose.disconnect();
  console.log('═══════════════════════════════════════════════');
  console.log('  ✅ SEED COMPLETED — Ready for testing!');
  console.log('═══════════════════════════════════════════════');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
