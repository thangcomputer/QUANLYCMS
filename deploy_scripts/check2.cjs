const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const res = await ssh.execCommand('ls -la /www/server/panel/vhost/nginx');
  console.log('Nginx configs:', res.stdout || res.stderr);
  
  const res2 = await ssh.execCommand('pm2 list');
  console.log('PM2 list:', res2.stdout || res2.stderr);
  process.exit(0);
}
check();
