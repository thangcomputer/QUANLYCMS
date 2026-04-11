const mongoose = require('mongoose');
require('dotenv').config();
const Teacher = require('./models/Teacher');

async function createAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);

  const exists = await Teacher.findOne({ role: 'admin' });
  if (exists) {
    console.log(`✅ Admin đã tồn tại: ${exists.name} | ${exists.phone}`);
    await mongoose.disconnect();
    return;
  }

  const admin = await Teacher.create({
    name: 'Admin Thắng Tin Học',
    phone: '0935758462',
    password: 'admin123',
    role: 'admin',
    status: 'active',
  });

  console.log(`✅ Tạo Admin: ${admin.name} | Login: admin / admin123`);
  await mongoose.disconnect();
}

createAdmin().catch(console.error);
