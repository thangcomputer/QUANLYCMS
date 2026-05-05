/**
 * sanitizeRegex — Escape chuỗi search để dùng an toàn trong MongoDB $regex
 * Chống: ReDoS, NoSQL injection, regex crafting attacks
 *
 * @param {string} str - Chuỗi đầu vào từ user
 * @param {number} maxLen - Độ dài tối đa (mặc định 100)
 * @returns {string} Chuỗi đã escape an toàn
 */
function sanitizeRegex(str, maxLen = 100) {
  if (!str || typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape all special regex chars
}

module.exports = { sanitizeRegex };
