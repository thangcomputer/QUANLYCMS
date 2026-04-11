const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const uri = 'mongodb://127.0.0.1:27017/quanlycms';

async function check() {
  await mongoose.connect(uri);
  const admins = await Teacher.find({ role: 'admin' });
  console.log('Admins:', admins.map(a => ({ name: a.name, phone: a.phone })));
  const teachers = await Teacher.find({ role: 'teacher' });
  console.log('Teachers:', teachers.map(t => ({ name: t.name, phone: t.phone })));
  const students = await Student.find({});
  console.log('Students:', students.map(s => ({ name: s.name, zalo: s.zalo })));
  process.exit(0);
}

check();
