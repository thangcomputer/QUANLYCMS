require('dotenv').config();
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Teacher.deleteMany({ phone: { $in: ['0999999991', '0999999992'] } });
  
  await Teacher.create({ name: 'GV TEST FAIL', phone: '0999999991', password: 'password', status: 'pending', role: 'teacher' });
  await Teacher.create({ name: 'GV TEST PASS', phone: '0999999992', password: 'password', status: 'pending', role: 'teacher' });
  
  console.log('Test teachers created successfully.');
  await mongoose.disconnect();
}

seed().catch(console.error);
