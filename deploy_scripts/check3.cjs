const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkServer() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const res = await ssh.execCommand('cat /www/server/panel/vhost/nginx/*.conf');
  console.log(res.stdout || res.stderr);
  
  const res2 = await ssh.execCommand('grep "app.get(" /www/wwwroot/quanlycms/server.js');
  console.log(res2.stdout || res2.stderr);
  process.exit(0);
}
checkServer();
