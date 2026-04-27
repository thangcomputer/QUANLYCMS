require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/quanlycms');
    console.log('✅ Connected to MongoDB');

    const beTho = await Student.findOne({ name: /BÉ THỎ/i }).lean();
    console.log('Bé thỏ:', JSON.stringify(beTho, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }
}

check();
