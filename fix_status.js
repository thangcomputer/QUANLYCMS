require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function fixStatuses() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/quanlycms');
    console.log('✅ Connected to MongoDB');

    const studentsToUpdate = await Student.find({
      teacherId: { $exists: true, $ne: null },
      $or: [
        { status: 'Chờ xếp lớp' },
        { status: { $exists: false } },
        { status: null },
        { status: "" }
      ]
    });

    console.log(`🔍 Found ${studentsToUpdate.length} students with teacher but status is missing or "Chờ xếp lớp"`);

    let count = 0;
    for (const student of studentsToUpdate) {
      student.status = 'Đang học';
      await student.save();
      count++;
    }

    console.log(`✅ Updated ${count} students to "Đang học"`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }
}

fixStatuses();
