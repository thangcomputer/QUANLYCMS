const mongoose = require('mongoose');
require('dotenv').config();

const teacherSchema = new mongoose.Schema({
  name: String,
  role: String,
  adminRole: String,
  branchId: mongoose.Schema.Types.ObjectId
});

const Teacher = mongoose.model('Teacher', teacherSchema);

async function checkAdmins() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const admins = await Teacher.find({ $or: [{ role: 'admin' }, { adminRole: 'STAFF' }] });
  console.log('Admins/Staff count:', admins.length);
  
  admins.forEach(a => {
    console.log(`- ${a.name} | Role: ${a.role} | AdminRole: ${a.adminRole} | Branch: ${a.branchId || 'NONE'}`);
  });
  
  await mongoose.disconnect();
}

checkAdmins();
