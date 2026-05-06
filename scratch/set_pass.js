const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function setup() {
  await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
  const Teacher = mongoose.connection.collection('teachers');
  const hash = await bcrypt.hash('123456', 10);
  await Teacher.updateOne({phone: '0393703659'}, {$set: {password: hash}});
  // user also provided teacher pass: 000444
  await Teacher.updateOne({phone: '000444'}, {$set: {password: await bcrypt.hash('000444', 10)}});
  console.log('Passwords set');
  process.exit(0);
}
setup();
