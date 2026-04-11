const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quanlycms').then(async () => {
  const Student = require('./models/Student');

  // Xóa student tên test
  const result = await Student.deleteMany({
    name: { $in: ['MÁY TÍNH', 'MAY TINH', '333', 'TEST', 'MÁYTÍNH'] }
  });
  console.log('Đã xóa:', result.deletedCount, 'học viên test');

  const remaining = await Student.find({}, 'name course paid').lean();
  console.log('Còn lại:', remaining.length, 'học viên:');
  remaining.forEach(s => console.log(' -', s.name, '|', s.course, '| paid:', s.paid));

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
