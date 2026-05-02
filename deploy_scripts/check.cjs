const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const res = await ssh.execCommand('ls -la /www/wwwroot/quanlycms');
  console.log(res.stdout || res.stderr);
  
  const res2 = await ssh.execCommand('ls -la /tmp/quanlycms_clone_temp');
  console.log(res2.stdout || res2.stderr);
  process.exit(0);
}
check();
