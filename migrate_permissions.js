const mongoose = require('mongoose');
require('dotenv').config();
const Teacher = require('./models/Teacher');

const OLD_TO_NEW = {
  'Quản lý Học viên':  'manage_students',
  'Quản lý học viên':  'manage_students',
  'Lịch dạy':          'manage_schedule',
  'Tài chính':         'manage_finance',
  'Đào tạo GV/HV':    'manage_training',
  'Cài đặt hệ thống': 'system_settings',
  'Nhật ký hệ thống': 'view_logs',
  'Đánh giá nội bộ':  'view_evaluations',
  'Quản lý Nhân viên': 'manage_staff',
  // Keys mới (giữ nguyên)
  'manage_students':   'manage_students',
  'manage_schedule':   'manage_schedule',
  'manage_finance':    'manage_finance',
  'manage_training':   'manage_training',
  'system_settings':   'system_settings',
  'view_logs':         'view_logs',
  'view_evaluations':  'view_evaluations',
  'manage_staff':      'manage_staff',
};

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlycms');
  const staffList = await Teacher.find({
    role: { $in: ['staff','admin'] },
    permissions: { $exists: true },
  });
  console.log(`Found ${staffList.length} staff/admin accounts`);

  for (const staff of staffList) {
    const oldPerms = staff.permissions || [];
    if (!oldPerms.length) { console.log(staff.name, ': no permissions, skip'); continue; }

    const newPerms = [...new Set(oldPerms.map(p => OLD_TO_NEW[p] || p).filter(Boolean))];
    await Teacher.findByIdAndUpdate(staff._id, { permissions: newPerms });
    console.log(`[${staff.name}] ${JSON.stringify(oldPerms)} → ${JSON.stringify(newPerms)}`);
  }
  console.log('✅ Migration hoàn tất');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
