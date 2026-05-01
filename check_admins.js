const mongoose = require('mongoose');
require('dotenv').config();
const Teacher = require('./models/Teacher');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const admins = await Teacher.find({ role: { $in: ['admin', 'staff'] } });
  console.log('--- ALL ADMINS/STAFF ---');
  admins.forEach(a => {
    console.log(`Name: ${a.name}, Role: ${a.role}, AdminRole: ${a.adminRole}, ID: ${a._id}`);
  });
  
  const superAdminsQuery = { role: 'admin', adminRole: { $ne: 'STAFF' } };
  const found = await Teacher.find(superAdminsQuery);
  console.log('--- FOUND WITH CURRENT QUERY ---');
  found.forEach(a => {
    console.log(`Name: ${a.name}, ID: ${a._id}`);
  });
  
  await mongoose.disconnect();
}
check();
