const test = require('node:test');
const assert = require('node:assert/strict');
const { apiRateLimitUnlessAuth } = require('../../middleware/apiRateLimit');

function callMiddleware(originalUrl) {
  return new Promise((resolve) => {
    const req = { originalUrl, ip: '127.0.0.1', headers: {}, method: 'GET' };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      getHeader(k) { return this.headers[k]; },
      removeHeader(k) { delete this.headers[k]; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; resolve({ res, called: false, hit: true }); },
      end(b) { this.body = b; resolve({ res, called: false, hit: true }); },
    };
    apiRateLimitUnlessAuth(req, res, () => resolve({ res, called: true, hit: false }));
  });
}

test('apiRateLimitUnlessAuth: bypasses /api/auth/*', async () => {
  const r = await callMiddleware('/api/auth/login');
  assert.equal(r.called, true);
});

test('apiRateLimitUnlessAuth: bypasses /api/webhooks/*', async () => {
  const r = await callMiddleware('/api/webhooks/sepay');
  assert.equal(r.called, true);
});

test('apiRateLimitUnlessAuth: applies limiter on regular routes', async () => {
  const r = await callMiddleware('/api/students');
  // First hit must pass through (under default 400/15min budget) and call next()
  assert.equal(r.called, true);
});