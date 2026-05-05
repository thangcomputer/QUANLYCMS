const { sanitizeRegex } = require('./middleware/sanitizeRegex');
const assert = require('assert');

console.log('--- Testing sanitizeRegex ---');

const testCases = [
  { input: 'admin', expected: 'admin' },
  { input: '(', expected: '\\(' },
  { input: '.*', expected: '\\.\\*' },
  { input: '(a+)+$', expected: '\\(a\\+\\)\\+\\$' },
  { input: '[a-z]', expected: '\\[a\\-z\\]' }
];

testCases.forEach(t => {
  const result = sanitizeRegex(t.input);
  console.log(`Input: "${t.input}" -> Output: "${result}"`);
  assert.strictEqual(result, t.expected);
});

console.log('\n✅ sanitizeRegex test PASSED!');

// Test with MongoDB style query simulation
const search = '(a+)+$';
const safeSearch = sanitizeRegex(search);
try {
  const regex = new RegExp(safeSearch, 'i');
  console.log('Regex created successfully:', regex);
} catch (e) {
  console.error('Failed to create regex:', e.message);
  process.exit(1);
}

console.log('--- All Tests Passed ---');
