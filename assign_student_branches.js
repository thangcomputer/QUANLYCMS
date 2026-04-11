/**
 * assign_student_branches.js
 * One-time migration: gán branchId mặc định (CS1) cho tất cả học viên chưa có branchId.
 * Admin có thể tự chỉnh lại sau từ UI.
 */
const mongoose = require('mongoose');

const CS1_ID   = '69d8a756f4ca0577c0d6a81e';  // Co so 1
const CS1_CODE = 'CS1';

mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
  const Student = require('./models/Student');

  const res = await Student.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: CS1_ID, branchCode: CS1_CODE } }
  );

  console.log(`✅ Updated ${res.modifiedCount} students → branchId: ${CS1_CODE}`);

  // Verify
  const students = await Student.find({}).select('name branchId branchCode').lean();
  students.forEach(s => console.log(` - ${s.name}: branchId=${s.branchId} (${s.branchCode})`));

  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
