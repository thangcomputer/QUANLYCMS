// Rich HTML helpers for LMS rendered HTML.
/**
 * Rich text from Admin (contenteditable / RichTextEditor) is stored as HTML.
 * Use plain text for list previews; sanitize + innerHTML for expanded/detail views.
 */

/**
 * Mutates anchor tags under root so navigation opens a new tab (LMS tab stays in session).
 * Skips javascript:, mailto:, tel:, and simple in-document #fragment anchors.
 */
export function applyAnchorNewTabPolicy(rootElement) {
  if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return;
  rootElement.querySelectorAll('a[href]').forEach((el) => {
    const href = (el.getAttribute('href') || '').trim();
    if (!href || /^javascript:/i.test(href)) return;
    if (/^mailto:/i.test(href) || /^tel:/i.test(href)) return;
    if (href === '#') return;
    if (/^#[^#/]+$/.test(href)) return;
    el.setAttribute('target', '_blank');
    const rel = (el.getAttribute('rel') || '')
      .split(/\s+/)
      .filter(Boolean);
    ['noopener', 'noreferrer'].forEach((token) => {
      if (!rel.includes(token)) rel.push(token);
    });
    el.setAttribute('rel', rel.join(' '));
  });
}

function rewriteAnchorsOpenInNewTab(html) {
  if (!html || typeof html !== 'string') return html;
  if (typeof document === 'undefined') return html;
  try {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    applyAnchorNewTabPolicy(wrap);
    return wrap.innerHTML;
  } catch {
    return html;
  }
}

export function htmlToPlainText(html) {
  if (html == null || typeof html !== 'string') return '';
  const s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, ' \u2022 ')
    .replace(/<[^>]+>/g, ' ');
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal sanitization for trusted admin HTML (not for untrusted user input). */
export function sanitizeRichHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
  return rewriteAnchorsOpenInNewTab(cleaned);
}

/** Phần câu hỏi admin khớp môn thi (coban ↔ computer). */
export function questionMatchesExamSubject(section, subjectId) {
  if (section == null || subjectId == null) return false;
  if (section === subjectId) return true;
  if (subjectId === 'coban' && section === 'computer') return true;
  return false;
}

export function isValidMcQuestion(q) {
  if (!q || q.type === 'essay') return false;
  if (q.type && q.type !== 'multiple') return false;
  const opts = (q.options || []).filter((o) => o && String(o).trim());
  return opts.length >= 2 && typeof q.correct === 'number' && q.correct >= 0 && q.correct < opts.length;
}

export function getStudentMcQuestionsForExam(studentQuestions, subjectId) {
  return (studentQuestions || []).filter(
    (q) => isValidMcQuestion(q) && questionMatchesExamSubject(q.section, subjectId),
  );
}
