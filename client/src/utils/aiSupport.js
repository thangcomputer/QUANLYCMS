/** Peer ảo — trợ lý AI hỗ trợ HV/GV (không đụng contacts thật). */
export const AI_SUPPORT_PEER = Object.freeze({
  id: 'ai_support',
  name: 'Trợ lý Thắng Tin Học',
  role: 'system',
  online: true,
});

export function isAiSupportPeer(user) {
  return String(user?.id || '') === AI_SUPPORT_PEER.id;
}

export function buildAiSupportConversationId(myRole, myId) {
  const sr = String(myRole || 'student');
  const sid = String(myId || '');
  const parts = [`${sr}_${sid}`, `system_${AI_SUPPORT_PEER.id}`].sort();
  return parts.join('__');
}

export const AI_ESCALATE_MARKER = 'Đã chuyển yêu cầu tới nhân viên hỗ trợ';
export const AI_BUSY_MARKER = 'Trợ lý AI đang bận';
export const AI_IDLE_PING = 'Bạn có còn đó không, cần hỗ trợ gì nữa không?';
export const AI_IDLE_END = 'Phiên hỗ trợ đã kết thúc.';
export const AI_IDLE_STILL = 'Mình vẫn ở đây. Bạn hỏi gì ạ?';

export function messageTimestamp(m) {
  if (m?.time instanceof Date) return m.time.getTime();
  return new Date(m?.createdAt || m?.timestamp || 0).getTime();
}

export function isAiEscalationMessage(m) {
  return String(m?.senderId || '') === AI_SUPPORT_PEER.id
    && String(m?.content || '').includes(AI_ESCALATE_MARKER);
}

export function isAiBusyReply(m) {
  return String(m?.senderId || '') === AI_SUPPORT_PEER.id
    && !m?.isRecalled
    && String(m?.content || '').includes(AI_BUSY_MARKER);
}

/** User gõ ý muốn chuyển thẳng sang nhân viên — không gọi AI. */
export const AI_SUPPORT_STATUS = Object.freeze({
  AI_ACTIVE: 'AI_ACTIVE',
  WAITING_FOR_SUPPORT: 'WAITING_FOR_SUPPORT',
  SUPPORT_ACTIVE: 'SUPPORT_ACTIVE',
  SUPPORT_RESOLVED: 'SUPPORT_RESOLVED',
  CLOSED: 'CLOSED',
});

export function handoffReasonLabel(reason) {
  const labels = {
    USER_REQUESTED: 'Người dùng yêu cầu hỗ trợ trực tiếp',
    REPEATED_FAILURE: 'AI trả lời chưa giải quyết được yêu cầu',
    TECHNICAL_ISSUE: 'Lỗi kỹ thuật cần nhân viên kiểm tra',
    PAYMENT_ISSUE: 'Vấn đề thanh toán',
    ACCESS_ISSUE: 'Vấn đề quyền truy cập',
    ACCOUNT_ISSUE: 'Vấn đề tài khoản',
  };
  const key = String(reason || '').trim().toUpperCase();
  return labels[key] || String(reason || '').trim() || 'Người dùng cần hỗ trợ';
}

export function isAiSupportConversationId(cid) {
  return String(cid || '').includes('system_ai_support');
}

export function wantsHumanEscalation(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /(hỗ trợ trực tiếp|gặp\s*(nhân\s*viên|support|hỗ trợ|chuyên\s*viên|tư vấn|người(\s*thật)?)|nói chuyện với\s*(người thật|nhân viên|tư vấn)|người thật|tư vấn viên|(cần|muốn|xin)\s*(hỗ trợ trực tiếp|gặp\s*(nhân viên|người|support)|người thật)|muốn gặp support|ai không giải quyết|chuyển\s*(nhân\s*viên|support|hỗ trợ)|không\s*hài\s*lòng|liên\s*hệ\s*(nhân\s*viên|support|tư vấn)|chat với nhân viên|gọi nhân viên)/i.test(t);
}

export function isSimpleGreeting(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?…,-]+$/g, '').trim();
  if (!t || t.length > 48) return false;
  return /^(xin\s*chào|chào(\s+(bạn|em|cô|thầy|ad|admin))?|hello(\s+bạn)?|hi(\s+(bạn|there))?|hey|alo)$/i.test(t);
}

export function isAiWelcomeReply(content) {
  const t = String(content || '');
  return /Trợ lý AI Tin Học của Thắng Tin Học/.test(t)
    && /hỗ trợ Word, Excel, PowerPoint, MOS, LMS/i.test(t);
}

/** Nút câu hỏi sẵn dưới lời chào AI. Gửi đúng `label` để backend FAQ không gọi Gemini. */
export const TEACHER_WELCOME_CHIPS = Object.freeze([
  { id: 'lms', label: 'Hướng dẫn sử dụng LMS' },
  { id: 'schedule', label: 'Hướng dẫn tạo lịch dạy cho học viên' },
  { id: 'finance', label: 'Xem tài chính' },
]);

export const STUDENT_WELCOME_CHIPS = Object.freeze([
  { id: 'schedule', label: 'Lịch học' },
  { id: 'video', label: 'Học video' },
  { id: 'sumif', label: 'Cách sử dụng hàm SUMIF, SUMIFS' },
  { id: 'vlookup', label: 'Cách sử dụng hàm VLOOKUP' },
  { id: 'if', label: 'Cách sử dụng hàm IF' },
]);

export function isAiQuestionLimitReply(content) {
  return /lượt hỏi Trợ lý AI hôm nay/i.test(String(content || ''));
}

export function isAiFaqChipLabel(text, role) {
  const t = String(text || '').trim();
  if (!t) return false;
  const chips = role === 'teacher' ? TEACHER_WELCOME_CHIPS : STUDENT_WELCOME_CHIPS;
  return chips.some((c) => c.label === t);
}

export function isAiIdlePing(content) {
  return String(content || '').includes('Bạn có còn đó không');
}

export function isAiIdleEnd(content) {
  return String(content || '').includes(AI_IDLE_END);
}

export function isAiIdleStill(content) {
  return String(content || '').includes(AI_IDLE_STILL);
}

/** Có ít nhất một câu trả lời AI thực sự (không phải tin chuyển nhân viên / chào tự động). */
export function hasMeaningfulAiReply(messages) {
  return (messages || []).some((m) => (
    String(m.senderId || '') === AI_SUPPORT_PEER.id
    && !m.isRecalled
    && m.messageType !== 'system'
    && !isAiEscalationMessage(m)
    && !isAiWelcomeReply(m.content)
    && !isAiIdlePing(m.content)
    && !isAiIdleEnd(m.content)
    && !isAiIdleStill(m.content)
    && !isAiQuestionLimitReply(m.content)
  ));
}

/** Hiện Có/Không chỉ sau khi học viên hỏi thật và AI đã trả lời — không hiện sau lời chào. */
export function canOfferHumanEscalation(messages, meId) {
  return Boolean(lastMeaningfulAiReplyId(messages, meId));
}

export function lastMeaningfulAiReplyId(messages, meId) {
  const msgs = messages || [];
  const myId = String(meId || '');
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (!m || m.isRecalled || m.messageType === 'system') continue;
    if (String(m.senderId || '') !== AI_SUPPORT_PEER.id) return '';
    if (isAiEscalationMessage(m) || isAiWelcomeReply(m.content) || isAiIdlePing(m.content) || isAiIdleEnd(m.content) || isAiIdleStill(m.content) || isAiQuestionLimitReply(m.content)) return '';

    let userContent = '';
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = msgs[j];
      if (!prev || prev.isRecalled || prev.messageType === 'system') continue;
      if (String(prev.senderId || '') === AI_SUPPORT_PEER.id) continue;
      if (myId && String(prev.senderId || '') !== myId) continue;
      userContent = String(prev.content || '');
      break;
    }
    if (!userContent || isSimpleGreeting(userContent)) return '';
    return String(m.id || m._id || '');
  }
  return '';
}

export function isSupportAgentContact(st) {
  if (!st) return false;
  const product = String(st.productRole || '').toUpperCase();
  const ar = String(st.adminRole || '').toUpperCase();
  return product === 'SUPPORT' || ar === 'SUPPORT';
}

export function isHumanSupportSender(m) {
  if (!m || String(m.senderId || '') === AI_SUPPORT_PEER.id) return false;
  const role = String(m.senderRole || '').toLowerCase();
  const ar = String(m.senderAdminRole || m.sender?.adminRole || '').toUpperCase();
  return role === 'staff' || ar === 'SUPPORT' || ar === 'STAFF';
}
