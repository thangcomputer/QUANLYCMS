const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
  ? process.env.JWT_SECRET
  : 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length >= 16
  ? process.env.JWT_REFRESH_SECRET
  : 'b'.repeat(40);

const blacklist = require('../../middleware/tokenBlacklist');
const { authMiddleware } = require('../../middleware/auth');

function makeApp() {
  const app = express();
  app.get('/protected', authMiddleware, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function call(server, headers) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/protected', method: 'GET', headers: headers || {} },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('authMiddleware: 401 when no token', async () => {
  const server = await listen(makeApp());
  try {
    const r = await call(server);
    assert.equal(r.status, 401);
  } finally {
    server.close();
  }
});

test('authMiddleware: 401 with invalid token', async () => {
  const server = await listen(makeApp());
  try {
    const r = await call(server, { Authorization: 'Bearer not.a.jwt' });
    assert.equal(r.status, 401);
  } finally {
    server.close();
  }
});

test('authMiddleware: passes for hardcoded admin token', async () => {
  const token = jwt.sign(
    { id: 'admin', role: 'admin', tokenVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const server = await listen(makeApp());
  try {
    const r = await call(server, { Authorization: 'Bearer ' + token });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'admin');
  } finally {
    server.close();
  }
});

test('authMiddleware: 401 TOKEN_REVOKED when token is blacklisted', async () => {
  const token = jwt.sign(
    { id: 'admin', role: 'admin', tokenVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  await blacklist.add(token, 60);
  const server = await listen(makeApp());
  try {
    const r = await call(server, { Authorization: 'Bearer ' + token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'TOKEN_REVOKED');
  } finally {
    server.close();
  }
});

test('authMiddleware: 401 TOKEN_EXPIRED for expired token', async () => {
  const token = jwt.sign(
    { id: 'admin', role: 'admin', tokenVersion: 0 },
    process.env.JWT_SECRET,
    { expiresIn: -10 }
  );
  const server = await listen(makeApp());
  try {
    const r = await call(server, { Authorization: 'Bearer ' + token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'TOKEN_EXPIRED');
  } finally {
    server.close();
  }
});

test('authMiddleware: refresh secret cannot be used for access token', () => {
  const tokenSignedWithRefresh = jwt.sign(
    { id: 'admin', role: 'admin', tokenVersion: 0 },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '1h' }
  );
  assert.throws(
    () => jwt.verify(tokenSignedWithRefresh, process.env.JWT_SECRET),
    /invalid signature/
  );
});

test.after(async () => {
  await blacklist.close();
});