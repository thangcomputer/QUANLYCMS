
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/quanlycms');
  const staffId = '0393703659';
  const messages = await Message.find({
    $or: [{ senderId: staffId }, { receiverId: staffId }]
  }).sort({ createdAt: -1 }).limit(10).lean();
  
  console.log('Messages involving Staff:', JSON.stringify(messages, null, 2));
  process.exit();
}

check().catch(console.error);
