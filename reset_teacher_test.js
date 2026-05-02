const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://127.0.0.1:27017/quanlycms';

const TeacherSchema = new mongoose.Schema({
  phone: String,
  status: String,
  testStatus: String,
  testScore: Number,
  lockReason: String
});

const Teacher = mongoose.model('Teacher', TeacherSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  const teacher = await Teacher.findOneAndUpdate(
    { phone: '020304' },
    { 
      status: 'pending',
      testStatus: null,
      testScore: 0,
      lockReason: null
    },
    { new: true }
  );
  console.log('Teacher reset:', teacher);
  await mongoose.disconnect();
}

main().catch(console.error);
