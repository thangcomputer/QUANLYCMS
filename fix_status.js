require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function fixStatuses() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/quanlycms');
    console.log('✅ Connected to MongoDB');

    // Tìm tất cả học viên có teacherId nhưng trạng thái đang là 'Chờ xếp lớp'
    const studentsToUpdate = await Student.find({
      teacherId: { $exists: true, $ne: null },
      status: 'Chờ xếp lớp'
    });

    console.log(`🔍 Found ${studentsToUpdate.length} students with teacher but status is "Chờ xếp lớp"`);

    let count = 0;
    for (const student of studentsToUpdate) {
      student.status = 'Đang học';
      await student.save();
      count++;
    }

    console.log(`✅ Updated ${count} students to "Đang học"`);
    
    // Tìm học viên hoàn thành (nếu cần script có thể dựa vào tổng số buổi, 
    // nhưng "Hoàn thành khóa học" thường do giảng viên set thủ công). 
    // Giữ nguyên các trạng thái khác.

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }
}

fixStatuses();
