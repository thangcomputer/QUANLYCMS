const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function forceSync() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  console.log('=== FORCE GIT SYNC ===');
  await ssh.execCommand('git fetch origin', { cwd: '/www/wwwroot/quanlycms' });
  const res = await ssh.execCommand('git reset --hard origin/main', { cwd: '/www/wwwroot/quanlycms' });
  console.log(res.stdout || res.stderr);
  
  console.log('\n=== RESTART PM2 ===');
  await ssh.execCommand('pm2 restart quanlycms');
  
  process.exit(0);
}
forceSync();
