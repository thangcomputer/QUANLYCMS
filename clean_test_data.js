const mongoose = require('mongoose');
require('dotenv').config();
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

async function fixAndVerify() {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Xóa toàn bộ GV không phải admin
  const delGV = await Teacher.deleteMany({ role: { $ne: 'admin' } });
  console.log(`🗑️  Xóa ${delGV.deletedCount} GV không phải admin`);

  // 2. Xóa toàn bộ HV test (zalo ngắn, tên test)
  const delHV = await Student.deleteMany({});
  console.log(`🗑️  Xóa ${delHV.deletedCount} HV test`);

  // 3. Kiểm tra cuối
  const teachers = await Teacher.find({}).select('name phone role status');
  const students = await Student.find({}).select('name zalo course');

  console.log('\n✅ DB sau khi dọn sạch:');
  console.log(`GV: ${teachers.length} | HV: ${students.length}`);
  teachers.forEach(t => console.log(`  GV: ${t.name} | ${t.phone} | ${t.role} | ${t.status}`));
  if (students.length === 0) console.log('  HV: (trống - sẵn sàng nhập thật)');

  await mongoose.disconnect();
}

fixAndVerify().catch(console.error);
