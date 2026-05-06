const mongoose = require('mongoose');
const Message = require('./models/Message');
const ConversationVisibility = require('./models/ConversationVisibility');
require('dotenv').config();

async function cleanup() {
  await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
  
  const result1 = await Message.deleteMany({ conversationId: { $regex: /^temp_/ } });
  console.log('Deleted temp messages:', result1.deletedCount);
  
  const result2 = await ConversationVisibility.deleteMany({ conversationId: { $regex: /^temp_/ } });
  console.log('Deleted temp conversation visibility:', result2.deletedCount);

  process.exit(0);
}
cleanup();
