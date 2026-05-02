const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkLocal() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  const pm2Logs = await ssh.execCommand('pm2 logs quanlycms --lines 20 --nostream');
  console.log('PM2 LOGS:\n', pm2Logs.stdout || pm2Logs.stderr);
  
  const curlRes = await ssh.execCommand('curl -s http://localhost:5000/');
  console.log('CURL OUTPUT:\n', curlRes.stdout || curlRes.stderr);
  
  process.exit(0);
}
checkLocal();
