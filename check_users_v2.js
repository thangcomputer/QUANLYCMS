const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const uri = 'mongodb://127.0.0.1:27017/quanlycms';

async function check() {
  await mongoose.connect(uri);
  const admins = await Teacher.find({ role: 'admin' });
  admins.forEach(u => console.log(`ADMIN: ${u.name} | ${u.phone}`));
  
  const teachers = await Teacher.find({ role: 'teacher' });
  teachers.forEach(u => console.log(`TEACHER: ${u.name} | ${u.phone}`));
  
  const students = await Student.find({});
  students.forEach(u => console.log(`STUDENT: ${u.name} | ${u.zalo}`));
  
  process.exit(0);
}

check();
