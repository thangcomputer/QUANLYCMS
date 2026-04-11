const mongoose = require('mongoose');
require('dotenv').config();
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const teachers = await Teacher.find({}).select('name phone role status createdAt');
  const students = await Student.find({}).select('name zalo course status createdAt');
  
  console.log('\n=== GIẢNG VIÊN trong DB ===');
  teachers.forEach((t, i) => console.log(`${i+1}. [${t.role}] ${t.name} | ${t.phone} | ${t.status} | ${t.createdAt?.toLocaleDateString('vi-VN')}`));
  
  console.log('\n=== HỌC VIÊN trong DB ===');
  students.forEach((s, i) => console.log(`${i+1}. ${s.name} | ${s.zalo} | ${s.course} | ${s.status} | ${s.createdAt?.toLocaleDateString('vi-VN')}`));
  
  console.log(`\nTổng: ${teachers.length} GV, ${students.length} HV`);
  await mongoose.disconnect();
}

check().catch(console.error);
