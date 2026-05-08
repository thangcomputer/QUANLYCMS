/**
 * Mongo-sanitize middleware compatible with Express 5.
 *
 * `express-mongo-sanitize@2` reassigns `req.query`, which Express 5 exposes
 * as a getter-only property (TypeError). This implementation walks the
 * incoming objects and mutates them in place by deleting / renaming keys
 * that start with `$` or contain `.` (Mongo operator markers).
 *
 * @param {{ replaceWith?: string, allowDots?: boolean }} options
 */
function mongoSanitize(options) {
  const opts = options || {};
  const replaceWith = typeof opts.replaceWith === 'string' ? opts.replaceWith : null;
  const allowDots = !!opts.allowDots;

  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) sanitizeObject(item);
      return;
    }
    for (const key of Object.keys(obj)) {
      const isDangerous = key.startsWith('$') || (!allowDots && key.includes('.'));
      if (isDangerous) {
        const value = obj[key];
        delete obj[key];
        if (replaceWith) {
          const safeKey = key.replace(/[$.]/g, replaceWith);
          if (!Object.prototype.hasOwnProperty.call(obj, safeKey)) {
            obj[safeKey] = value;
          }
        }
      }
      sanitizeObject(obj[key.startsWith('$') || (!allowDots && key.includes('.')) ? key.replace(/[$.]/g, replaceWith || '') : key]);
    }
  }

  return function (req, _res, next) {
    try {
      // req.body, req.params, req.headers are mutable plain objects
      if (req.body) sanitizeObject(req.body);
      if (req.params) sanitizeObject(req.params);
      if (req.headers) sanitizeObject(req.headers);
      // req.query in Express 5 is a getter; mutate the underlying object
      if (req.query) sanitizeObject(req.query);
    } catch {
      // Never block the request because of a sanitizer hiccup
    }
    next();
  };
}

module.exports = mongoSanitize;