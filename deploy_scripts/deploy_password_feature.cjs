const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

async function deploy() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  const localDist = path.join(__dirname, 'QUANLYCMS', 'client', 'dist');

  // 1. Remove old dist
  console.log('=== 1. REMOVE OLD DIST ===');
  await ssh.execCommand('rm -rf /www/wwwroot/quanlycms/client/dist');

  // 2. Upload new dist
  console.log('=== 2. UPLOAD NEW DIST ===');
  const status = await ssh.putDirectory(localDist, '/www/wwwroot/quanlycms/client/dist', {
    recursive: true, concurrency: 5,
    tick: (lp, rp, err) => console.log(err ? `  ❌ ${path.basename(lp)}` : `  ✅ ${path.basename(lp)}`)
  });
  console.log(status ? '\n✅ Upload OK' : '\n❌ Upload FAILED');

  // 3. Git pull (sync source code including backend changes)
  console.log('\n=== 3. GIT PULL ===');
  const pull = await ssh.execCommand('cd /www/wwwroot/quanlycms && git pull origin main 2>&1');
  console.log(pull.stdout || pull.stderr);

  // 4. Restart backend (needed because authRoutes.js changed)
  console.log('\n=== 4. RESTART PM2 ===');
  const restart = await ssh.execCommand('pm2 restart quanlycms && pm2 save');
  console.log(restart.stdout || restart.stderr);

  // 5. Wait and verify
  await new Promise(r => setTimeout(r, 3000));
  console.log('\n=== 5. VERIFY ===');
  const v = await ssh.execCommand('curl -sk -o /dev/null -w "%{http_code}" https://dashboard.giasutinhoc24h.com/');
  console.log('Dashboard HTTPS status:', v.stdout);

  // Check PM2 status
  const pm2 = await ssh.execCommand('pm2 list');
  console.log(pm2.stdout);

  process.exit(0);
}
deploy();
