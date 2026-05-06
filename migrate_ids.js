const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MessageSchema = new mongoose.Schema({
  conversationId: String,
  senderId: String,
  senderRole: String,
  receiverId: String,
  receiverRole: String,
}, { strict: false });

const Message = mongoose.model('Message', MessageSchema);

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/quanlycms');
  console.log('Connected to MongoDB');

  const messages = await Message.find({});
  console.log(`Found ${messages.length} messages`);

  let count = 0;
  for (const m of messages) {
    if (m.isGroup) continue;

    const sRole = (m.senderRole === 'admin' || m.senderRole === 'staff') ? 'admin' : m.senderRole;
    const rRole = (m.receiverRole === 'admin' || m.receiverRole === 'staff') ? 'admin' : m.receiverRole;
    
    const isOneSideAdmin = (sRole === 'admin' || rRole === 'admin');
    const isOneSideStudent = (sRole === 'student' || rRole === 'student');

    const sIdForConv = (sRole === 'admin' && isOneSideStudent) ? 'admin' : m.senderId;
    const rIdForConv = (rRole === 'admin' && isOneSideStudent) ? 'admin' : m.receiverId;

    const newConvId = [
      `${sRole}_${sIdForConv}`,
      `${rRole}_${rIdForConv}`
    ].sort().join('__');

    if (m.conversationId !== newConvId || m.senderId !== sIdForConv || m.receiverId !== rIdForConv) {
      m.conversationId = newConvId;
      m.senderId = sIdForConv;
      m.receiverId = rIdForConv;
      await m.save();
      count++;
    }
  }

  console.log(`Updated ${count} messages`);
  await mongoose.disconnect();
}

migrate().catch(err => console.error(err));
