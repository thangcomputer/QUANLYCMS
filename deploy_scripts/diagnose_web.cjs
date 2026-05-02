const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function diagnose() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  console.log('=== 1. PM2 STATUS ===');
  const pm2 = await ssh.execCommand('pm2 list');
  console.log(pm2.stdout || pm2.stderr);

  console.log('\n=== 2. PM2 LOGS (last 30 lines) ===');
  const logs = await ssh.execCommand('pm2 logs quanlycms --lines 30 --nostream');
  console.log(logs.stdout || logs.stderr);

  console.log('\n=== 3. APACHE STATUS ===');
  const apache = await ssh.execCommand('systemctl status httpd --no-pager -l 2>/dev/null || /etc/init.d/httpd status');
  console.log(apache.stdout || apache.stderr);

  console.log('\n=== 4. PORT 5000 CHECK ===');
  const port = await ssh.execCommand('ss -tlnp | grep 5000');
  console.log(port.stdout || '(Port 5000 not listening)');

  console.log('\n=== 5. PORT 80/443 CHECK ===');
  const ports = await ssh.execCommand('ss -tlnp | grep -E ":80|:443"');
  console.log(ports.stdout || '(No ports 80/443 listening)');

  console.log('\n=== 6. SSL CERT CHECK ===');
  const ssl = await ssh.execCommand('ls -la /www/server/panel/vhost/cert/dashboard.giasutinhoc24h.com/ 2>/dev/null || echo "No SSL cert found for dashboard"');
  console.log(ssl.stdout || ssl.stderr);

  console.log('\n=== 7. APACHE VHOST CONFIG ===');
  const vhost = await ssh.execCommand('cat /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf 2>/dev/null || echo "No apache vhost found"');
  console.log(vhost.stdout || vhost.stderr);

  console.log('\n=== 8. CURL LOCAL TEST ===');
  const curl = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/auth/me');
  console.log('Backend API status code:', curl.stdout || curl.stderr);

  console.log('\n=== 9. DISK SPACE ===');
  const disk = await ssh.execCommand('df -h / | tail -1');
  console.log(disk.stdout || disk.stderr);

  console.log('\n=== 10. MEMORY ===');
  const mem = await ssh.execCommand('free -h | head -2');
  console.log(mem.stdout || mem.stderr);

  process.exit(0);
}
diagnose();
