const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const students = await mongoose.model('Student', new mongoose.Schema({})).find({ phone: '222222' });
  console.log('Students with 222222:', students.length);
  if (students.length > 0) {
    console.log('First student ID:', students[0]._id);
  }
  
  const admins = await mongoose.model('Admin', new mongoose.Schema({})).find({ username: 'admin' });
  console.log('Admins with admin:', admins.length);
  
  process.exit(0);
}
check();
