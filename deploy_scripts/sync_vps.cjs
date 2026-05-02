const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

function getVpsConnection() {
  const password = process.env.VPS_PASSWORD;
  if (!password) {
    throw new Error('Missing VPS_PASSWORD environment variable.');
  }
  return { host: '103.124.92.238', username: 'root', password };
}

async function sync() {
  await ssh.connect(getVpsConnection());

  // 1. Pull source code from GitHub to VPS
  console.log('=== 1. GIT PULL ON VPS ===');
  const pull = await ssh.execCommand('cd /www/wwwroot/quanlycms && git pull origin main 2>&1');
  console.log(pull.stdout || pull.stderr);

  // 2. Restart PM2
  console.log('\n=== 2. RESTART PM2 ===');
  const restart = await ssh.execCommand('pm2 restart quanlycms');
  console.log(restart.stdout || restart.stderr);

  // 3. Save PM2
  await ssh.execCommand('pm2 save');
  console.log('\n✅ Synced & restarted');

  process.exit(0);
}
sync();
