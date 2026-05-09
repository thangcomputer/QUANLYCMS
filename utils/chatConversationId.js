const mongoose = require('mongoose');

function normalizeChatRole(role) {
  if (!role) return role;
  const r = String(role).toLowerCase();
  if (r === 'staff') return 'admin';
  return r;
}

function isMongoObjectId24(id) {
  const s = String(id || '');
  return mongoose.Types.ObjectId.isValid(s) && s.length === 24;
}

function buildConversationId(senderRole, senderId, receiverRole, receiverId) {
  const sr = normalizeChatRole(senderRole);
  const rr = normalizeChatRole(receiverRole);
  const sid = String(senderId == null ? '' : senderId);
  const rid = String(receiverId == null ? '' : receiverId);

  if (sr === 'admin' && rr === 'student') {
    // Staff/admin cụ thể → HV: tách theo senderId (để mỗi staff có thread riêng)
    const adminSideId = sid === 'admin' || !isMongoObjectId24(sid) ? 'admin' : sid;
    return ['admin_' + adminSideId, 'student_' + rid].sort().join('__');
  }
  if (sr === 'student' && rr === 'admin') {
    const adminSideId = rid === 'admin' || !isMongoObjectId24(rid) ? 'admin' : rid;
    return ['admin_' + adminSideId, 'student_' + sid].sort().join('__');
  }

  return [sr + '_' + sid, rr + '_' + rid].sort().join('__');
}

module.exports = { buildConversationId, normalizeChatRole, isMongoObjectId24 };
