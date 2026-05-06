const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function setup() {
  await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
  const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', new mongoose.Schema({ phone: String, branchCode: String, branchId: mongoose.Schema.Types.ObjectId, role: String, adminRole: String }, {strict: false}));
  const Student = mongoose.models.Student || mongoose.model('Student', new mongoose.Schema({ phone: String, branchCode: String, branchId: mongoose.Schema.Types.ObjectId, password: String, role: String, name: String }, {strict: false}));
  const Branch = mongoose.models.Branch || mongoose.model('Branch', new mongoose.Schema({ code: String, name: String }, {strict: false}));
  
  const branchONL = await Branch.findOne({code: 'ONL'}) || await Branch.create({name: 'Online', code: 'ONL'});
  const branchCS1 = await Branch.findOne({code: 'CS1'}) || await Branch.create({name: 'Cơ sở 1', code: 'CS1'});
  
  await Student.updateOne({phone: '222222'}, { $set: { branchCode: 'ONL', branchId: branchONL._id, password: await bcrypt.hash('222222', 10) } });
  await Student.deleteOne({phone: '555555'});
  await Student.create({ name: 'Student 555555', phone: '555555', branchCode: 'CS1', branchId: branchCS1._id, password: await bcrypt.hash('555555', 10), role: 'student', status: 'Active' });
  
  // also make sure teacher 000444 is ONL
  await Teacher.updateOne({phone: '000444'}, { $set: { branchCode: 'ONL', branchId: branchONL._id } });
  
  // also make sure staff is ONL
  await Teacher.updateOne({phone: '0393703659'}, { $set: { branchCode: 'ONL', branchId: branchONL._id } });

  console.log('Data setup complete for testing');
  process.exit(0);
}
setup();
