const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('Dashboard header không còn ô tìm kiếm global', async () => {
  const filePath = path.resolve(__dirname, '../client/src/components/DashboardLayout.jsx');
  const src = await fs.readFile(filePath, 'utf8');

  assert.ok(!src.includes('placeholder="Tìm tên, SĐT..."'));
  assert.ok(!src.includes('Tìm tên, SĐT...'));
});

