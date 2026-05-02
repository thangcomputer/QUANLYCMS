
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/quanlycms');
  const messages = await Message.find({
    $or: [{ receiverId: 'admin' }, { senderId: 'admin' }]
  }).sort({ createdAt: -1 }).limit(10).lean();
  
  console.log('Messages involving admin:', JSON.stringify(messages, null, 2));
  process.exit();
}

check().catch(console.error);
