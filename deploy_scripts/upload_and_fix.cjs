const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

function getVpsConnection() {
  const password = process.env.VPS_PASSWORD;
  if (!password) {
    throw new Error('Missing VPS_PASSWORD environment variable.');
  }
  return { host: '103.124.92.238', username: 'root', password };
}

async function upload() {
  await ssh.connect(getVpsConnection());

  const localDist = path.join(__dirname, '..', 'client', 'dist');

  // 1. Remove old dist in both locations
  console.log('=== 1. REMOVE OLD DIST ===');
  await ssh.execCommand('rm -rf /www/wwwroot/quanlycms/client/dist');
  await ssh.execCommand('rm -rf /www/wwwroot/dashboard.giasutinhoc24h.com/client/dist');
  console.log('Old dist removed');

  // 2. Upload new dist to both locations
  console.log('\n=== 2. UPLOAD NEW DIST ===');
  const s1 = await ssh.putDirectory(localDist, '/www/wwwroot/quanlycms/client/dist', { recursive: true, concurrency: 5 });
  const s2 = await ssh.putDirectory(localDist, '/www/wwwroot/dashboard.giasutinhoc24h.com/client/dist', { recursive: true, concurrency: 5 });
  console.log((s1 && s2) ? '\n✅ Upload successful to both locations!' : '\n❌ Upload failed!');

  // 3. Update .env on VPS to use HTTPS for CLIENT_URL
  console.log('\n=== 3. UPDATE CLIENT_URL TO HTTPS ===');
  const updateEnv = await ssh.execCommand("sed -i 's|CLIENT_URL=http://dashboard|CLIENT_URL=https://dashboard|' /www/wwwroot/quanlycms/.env");
  console.log(updateEnv.stdout || updateEnv.stderr || 'Updated');

  // 4. Restart PM2
  console.log('\n=== 4. RESTART PM2 ===');
  const restart = await ssh.execCommand('pm2 restart quanlycms');
  console.log(restart.stdout || restart.stderr);

  // 5. Wait and verify
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== 5. FINAL VERIFY ===');
  const curl = await ssh.execCommand('curl -sk -o /dev/null -w "%{http_code}" https://dashboard.giasutinhoc24h.com/');
  console.log('HTTPS status:', curl.stdout);

  const pm2status = await ssh.execCommand('pm2 list');
  console.log(pm2status.stdout);

  // 6. Save PM2
  await ssh.execCommand('pm2 save');

  process.exit(0);
}
upload();
