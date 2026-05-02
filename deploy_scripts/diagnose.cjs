const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function diagnose() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  console.log('=== PM2 STATUS ===');
  const pm2 = await ssh.execCommand('pm2 list');
  console.log(pm2.stdout);
  
  console.log('=== PM2 LOGS RECENT ===');
  const logs = await ssh.execCommand('pm2 logs quanlycms --lines 30 --nostream');
  console.log(logs.stdout);
  console.log(logs.stderr);
  
  console.log('=== CURL localhost:5000 ===');
  const curl = await ssh.execCommand('curl -s http://localhost:5000/');
  console.log(curl.stdout || curl.stderr);
  
  console.log('=== NGINX STATUS ===');
  const nginx = await ssh.execCommand('systemctl status nginx | head -20');
  console.log(nginx.stdout);
  
  console.log('=== NGINX CONF ===');
  const conf = await ssh.execCommand('cat /www/server/panel/vhost/nginx/103.124.92.238.conf');
  console.log(conf.stdout || conf.stderr);
  
  console.log('=== PORT 5000 LISTENING? ===');
  const port = await ssh.execCommand('netstat -tlnp | grep 5000');
  console.log(port.stdout || port.stderr);
  
  console.log('=== PORT 80 LISTENING? ===');
  const port80 = await ssh.execCommand('netstat -tlnp | grep :80');
  console.log(port80.stdout || port80.stderr);
  
  process.exit(0);
}
diagnose();
