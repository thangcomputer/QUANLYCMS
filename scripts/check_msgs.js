const mongoose = require('mongoose');
const Message = require('../models/Message');
require('dotenv').config();
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
  const msgs = await Message.find().sort({ createdAt: -1 }).limit(20);
  msgs.forEach(m => console.log(`[${m.createdAt}] convId: ${m.conversationId} | sender: ${m.senderId} | receiver: ${m.receiverId} | msg: ${m.content}`));
  process.exit(0);
}
run();
