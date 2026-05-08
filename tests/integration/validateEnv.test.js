const test = require('node:test');
const assert = require('node:assert/strict');

function freshValidateEnv() {
  delete require.cache[require.resolve('../../config/validateEnv')];
  return require('../../config/validateEnv');
}

const STRONG = 'a'.repeat(40);
const STRONG2 = 'b'.repeat(40);

test('validateEnv: rejects short JWT_SECRET', () => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'short';
  process.env.JWT_REFRESH_SECRET = STRONG;
  assert.throws(() => freshValidateEnv()(), /JWT_SECRET must be at least/);
});

test('validateEnv: rejects identical JWT secrets', () => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = STRONG;
  process.env.JWT_REFRESH_SECRET = STRONG;
  assert.throws(() => freshValidateEnv()(), /must not equal JWT_SECRET/);
});

test('validateEnv: rejects short refresh secret', () => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = STRONG;
  process.env.JWT_REFRESH_SECRET = 'tiny';
  assert.throws(() => freshValidateEnv()(), /JWT_REFRESH_SECRET must be at least/);
});

test('validateEnv: requires CLIENT_URL in production', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = STRONG;
  process.env.JWT_REFRESH_SECRET = STRONG2;
  delete process.env.CLIENT_URL;
  assert.throws(() => freshValidateEnv()(), /CLIENT_URL is required/);
});

test('validateEnv: passes with strong distinct secrets and CLIENT_URL', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = STRONG;
  process.env.JWT_REFRESH_SECRET = STRONG2;
  process.env.CLIENT_URL = 'https://example.com';
  assert.doesNotThrow(() => freshValidateEnv()());
});

test('validateEnv: production requires longer (>=32) secrets', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'a'.repeat(20);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(20);
  process.env.CLIENT_URL = 'https://example.com';
  assert.throws(() => freshValidateEnv()(), /at least 32 characters/);
});