
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/quanlycms');
  const branchId = '69d93103fc94ddf67c87f7ff'; // ONL branch
  
  const students = await Student.find({ branchId }).select('name').lean();
  const teachers = await Teacher.find({ role: 'teacher', status: 'active', branchId }).select('name').lean();
  const admins = await Teacher.find({ role: { $in: ['admin', 'staff'] }, branchId }).select('name').lean();
  
  console.log('--- TARGETS FOR BRANCH ONL ---');
  console.log('Students:', students);
  console.log('Teachers:', teachers);
  console.log('Admins/Staff:', admins);
  
  process.exit();
}

check().catch(err => { console.error(err); process.exit(1); });
