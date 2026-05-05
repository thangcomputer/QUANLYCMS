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

  const localDist = path.join(__dirname, 'QUANLYCMS', 'client', 'dist');

  // 1. Remove old dist
  console.log('=== 1. REMOVE OLD DIST ===');
  const rm = await ssh.execCommand('rm -rf /www/wwwroot/quanlycms/client/dist');
  console.log('Old dist removed');

  // 2. Upload new dist
  console.log('\n=== 2. UPLOAD NEW DIST ===');
  const status = await ssh.putDirectory(localDist, '/www/wwwroot/quanlycms/client/dist', {
    recursive: true,
    concurrency: 5,
    tick: (localPath, remotePath, error) => {
      if (error) {
        console.log('  ❌', path.basename(localPath));
      } else {
        console.log('  ✅', path.basename(localPath));
      }
    }
  });
  console.log(status ? '\n✅ Upload successful!' : '\n❌ Upload failed!');

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
