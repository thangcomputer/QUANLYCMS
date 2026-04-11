require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  // Xóa các transaction có:
  // 1. Amount > 1 tỷ (dữ liệu test vô lý)
  // 2. TeacherName là chuỗi số thuần (test teacher)
  const result = await Transaction.deleteMany({
    $or: [
      { amount: { $gt: 1000000000 } },
      { teacherName: { $regex: /^\d+$/ } }
    ]
  });
  console.log('Deleted bad transactions:', result.deletedCount);

  const remaining = await Transaction.find({}).sort({ createdAt: -1 }).limit(10);
  console.log('Remaining transactions:', remaining.length);
  remaining.forEach(t => {
    console.log(`  - ${t.teacherName}: ${t.amount.toLocaleString('vi-VN')}đ [${t.status}] ${t.month}`);
  });

  mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
