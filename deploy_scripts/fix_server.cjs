const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fix() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  // 1. Kill any process on port 5000
  console.log('=== 1. KILL PORT 5000 PROCESSES ===');
  const kill = await ssh.execCommand('pm2 delete quanlycms 2>/dev/null; fuser -k 5000/tcp 2>/dev/null; sleep 1; echo "Done killing port 5000"');
  console.log(kill.stdout || kill.stderr);

  // 2. Fix .env file - add missing MONGODB_URI and other essential vars
  console.log('\n=== 2. FIX .ENV FILE ===');
  const envContent = `PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/quanlycms
JWT_SECRET=thangTinHoc_secret_key_2026
JWT_REFRESH_SECRET=thangTinHoc_refresh_secret_key_2026
JWT_EXPIRES_IN=8h
NODE_ENV=production

# ── Client URL ──────────────────────────────────────────────────────────────
CLIENT_URL=http://dashboard.giasutinhoc24h.com

# ── Google OAuth 2.0 ─
GOOGLE_CLIENT_ID=472584566291-mtiej0a75fm2gpc5eeju94ndmujped26.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://dashboard.giasutinhoc24h.com/api/auth/google/callback

# ── Gemini API ─
VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# ── Zalo OAuth ─
ZALO_APP_ID=YOUR_ZALO_APP_ID
ZALO_APP_SECRET=YOUR_ZALO_APP_SECRET
ZALO_CALLBACK_URL=http://dashboard.giasutinhoc24h.com/api/auth/zalo/callback

# ── Thông tin ngân hàng ─
BANK_ID=ACB
ACCOUNT_NO=4628686
ACCOUNT_NAME=PHI VAN THANG
`;

  const writeEnv = await ssh.execCommand(`cat > /www/wwwroot/quanlycms/.env << 'ENVEOF'
${envContent}
ENVEOF`);
  console.log(writeEnv.stdout || writeEnv.stderr || 'ENV file written successfully');

  // 3. Verify .env
  console.log('\n=== 3. VERIFY .ENV ===');
  const verify = await ssh.execCommand('cat /www/wwwroot/quanlycms/.env');
  console.log(verify.stdout);

  // 4. Check MongoDB is running
  console.log('\n=== 4. CHECK MONGODB ===');
  const mongo = await ssh.execCommand('mongosh --eval "db.adminCommand({ping:1})" 2>/dev/null || mongosh --eval "db.runCommand({ping:1})" 2>/dev/null || echo "Checking mongod..." && systemctl status mongod --no-pager -l 2>/dev/null | head -5');
  console.log(mongo.stdout || mongo.stderr);

  // 5. Start quanlycms with PM2
  console.log('\n=== 5. START QUANLYCMS ===');
  const start = await ssh.execCommand('cd /www/wwwroot/quanlycms && NODE_ENV=production pm2 start server.js --name quanlycms');
  console.log(start.stdout || start.stderr);

  // 6. Wait and check
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n=== 6. PM2 STATUS ===');
  const status = await ssh.execCommand('pm2 list');
  console.log(status.stdout);

  console.log('\n=== 7. PM2 LOGS ===');
  const logs = await ssh.execCommand('pm2 logs quanlycms --lines 15 --nostream');
  console.log(logs.stdout || logs.stderr);

  console.log('\n=== 8. PORT 5000 CHECK ===');
  const port = await ssh.execCommand('ss -tlnp | grep 5000');
  console.log(port.stdout || '(Port 5000 still not listening)');

  // 9. Save PM2 config so it survives reboot
  console.log('\n=== 9. SAVE PM2 ===');
  const save = await ssh.execCommand('pm2 save');
  console.log(save.stdout || save.stderr);

  process.exit(0);
}
fix();
