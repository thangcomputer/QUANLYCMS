const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const uri = 'mongodb://127.0.0.1:27017/quanlycms';

async function setup() {
  await mongoose.connect(uri);
  
  // Teacher
  await Teacher.findOneAndUpdate({ phone: '0999888777' }, { password: '123456', status: 'active' });
  
  // Student
  const studentPhone = '0987654321';
  const sExists = await Student.findOne({ zalo: studentPhone });
  if (sExists) {
    sExists.password = '123456';
    await sExists.save();
  } else {
    await Student.create({
      name: 'Test Student',
      zalo: studentPhone,
      password: '123456',
      course: 'Microsoft Excel Master',
      price: 1500000,
      paid: true,
      status: 'Đang học'
    });
  }
  
  process.exit(0);
}

setup();
