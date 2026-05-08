const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
  
  // Define Schemas
  const branchSchema = new mongoose.Schema({ name: String, code: String });
  const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

  const teacherSchema = new mongoose.Schema({ 
    name: String, phone: String, password: String, role: String, 
    adminRole: String, branchId: mongoose.Schema.Types.ObjectId, 
    branchCode: String, status: String 
  });
  const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema);
  
  const studentSchema = new mongoose.Schema({ 
    name: String, phone: String, password: String, role: String, 
    branchId: mongoose.Schema.Types.ObjectId, branchCode: String, 
    teacherId: mongoose.Schema.Types.ObjectId 
  });
  const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

  const hash = await bcrypt.hash('123456', 10);

  // Cleanup
  await Branch.deleteMany({ code: { $in: ['CS1', 'CS2'] } });
  await Teacher.deleteMany({ phone: { $in: ['111111', '333333', '444444'] } });
  await Student.deleteMany({ phone: { $in: ['222222', '555555'] } });

  // Create Branches
  const branch1 = await Branch.create({ name: 'Chi nhánh 1', code: 'CS1' });
  const branch2 = await Branch.create({ name: 'Chi nhánh 2', code: 'CS2' });

  // Create accounts
  const superAdmin = await Teacher.create({ 
    name: 'Super Admin', phone: '111111', password: hash, 
    role: 'admin', adminRole: 'SUPER_ADMIN', branchCode: 'HỆ THỐNG', status: 'active' 
  });
  
  const staffA = await Teacher.create({ 
    name: 'Staff Branch A', phone: '333333', password: hash, 
    role: 'staff', adminRole: 'STAFF', branchId: branch1._id, branchCode: 'CS1', status: 'active' 
  });
  
  const teacherA = await Teacher.create({ 
    name: 'Teacher Branch A', phone: '444444', password: hash, 
    role: 'teacher', adminRole: null, branchId: branch1._id, branchCode: 'CS1', status: 'active' 
  });
  
  const studentA = await Student.create({ 
    name: 'Student Branch A', phone: '222222', password: hash, 
    role: 'student', branchId: branch1._id, branchCode: 'CS1', teacherId: teacherA._id 
  });
  
  const studentB = await Student.create({ 
    name: 'Student Branch B', phone: '555555', password: hash, 
    role: 'student', branchId: branch2._id, branchCode: 'CS2' 
  });

  console.log('Test accounts created successfully with proper Branch IDs.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
