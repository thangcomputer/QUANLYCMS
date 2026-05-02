const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkClientDir() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const res = await ssh.execCommand('ls -la /www/wwwroot/quanlycms/client');
  console.log(res.stdout || res.stderr);
  process.exit(0);
}
checkClientDir();
