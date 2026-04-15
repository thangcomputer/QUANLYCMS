const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/thang_tin_hoc').then(async () => {
  const db = mongoose.connection.db;
  const docs = await db.collection('students').find({ 'examProgress.0': { $exists: true } }).toArray();
  for (const doc of docs) {
    let updated = false;
    for (const ep of doc.examProgress) {
      if (!ep.attemptCount) {
         ep.attemptCount = 1;
         updated = true;
      }
    }
    if (updated) {
      await db.collection('students').updateOne({ _id: doc._id }, { $set: { examProgress: doc.examProgress } });
    }
  }
  console.log("Xong");
  process.exit(0);
});
