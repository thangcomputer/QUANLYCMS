const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function restartServer() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const pm2res = await ssh.execCommand('pm2 restart quanlycms');
  console.log('PM2 RESTART:', pm2res.stdout);
  process.exit(0);
}
restartServer();
