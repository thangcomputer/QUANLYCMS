/**
 * Logic chấm bài thi Giảng viên / Trắc nghiệm.
 * Ngân hàng câu hỏi do Admin quản lý (API + DataContext), không còn seed cứng trong file này.
 */

/** @deprecated Giữ export rỗng để tránh import cũ; dùng `questions` từ DataContext / API. */
export const QUESTION_BANK = [];

/**
 * Lấy ngẫu nhiên tối đa `total` câu từ một mảng ngân hàng (xáo trộn).
 * @param {number} total
 * @param {object[]} bank
 */
export const getRandomQuestions = (total = 10, bank = []) => {
  const source = Array.isArray(bank) ? bank.filter(Boolean) : [];
  if (!source.length) return [];
  return [...source].sort(() => Math.random() - 0.5).slice(0, Math.min(total, source.length));
};

/**
 * Chấm điểm theo phần (section). Câu tự luận (essay) không tính vào % tự động.
 */
export const gradeAnswers = (questions, answers) => {
  const result = { excel: 0, word: 0, powerpoint: 0, situation: 0, total: 0 };
  const count = { excel: 0, word: 0, powerpoint: 0, situation: 0 };

  questions.forEach((q, i) => {
    if (!q.type || q.type === 'multiple') {
      const sec = q.section || 'situation';
      count[sec] = (count[sec] || 0) + 1;
      if (answers[i] === q.correct) {
        result[sec] = (result[sec] || 0) + 1;
      }
    }
  });

  const mcCount = Object.values(count).reduce((a, b) => a + b, 0);
  const correct = Object.values(result).reduce((a, b) => a + b, 0);
  result.total = mcCount > 0 ? Math.round((correct / mcCount) * 100) : 0;
  result.count = count;

  result.pass = result.total >= 80
    && Object.keys(count).every(
      (sec) => count[sec] === 0 || (result[sec] / count[sec]) >= 0.5,
    );

  return result;
};
