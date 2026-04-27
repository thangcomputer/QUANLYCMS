const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Tạo JWT token quyền SUPER_ADMIN mô phỏng
const token = jwt.sign(
  { id: 'admin', role: 'admin', name: 'Admin Test', adminRole: 'SUPER_ADMIN', aud: 'internal' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const k6Path = path.join(__dirname, 'k6-bin', 'k6-v0.50.0-windows-amd64', 'k6.exe');
const scriptPath = path.join(__dirname, 'k6_api_load.js');

console.log('🚀 Running K6 Load Test...');
console.log(`Executable: ${k6Path}`);

const child = spawn(k6Path, ['run', '-e', `JWT_TOKEN=${token}`, '-e', 'API_BASE_URL=http://localhost:5000', scriptPath], {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  console.log(`\n✅ K6 test execution finished with code ${code}`);
});
