const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixApacheConflict() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  console.log('=== Kiểm tra Nginx và Apache ===');
  const check = await ssh.execCommand('which nginx && which apache2 && which httpd');
  console.log(check.stdout);
  
  // aaPanel dùng Nginx làm proxy cho Apache thường
  // Apache lắng nghe port 88 hoặc 8080, Nginx port 80
  // Nhưng ở đây có vẻ Apache đang dùng port 80
  // Kiểm tra port Apache đang lắng nghe
  console.log('=== Apache listening ports ===');
  const apachePorts = await ssh.execCommand('cat /www/server/apache/conf/httpd.conf | grep Listen');
  console.log(apachePorts.stdout);
  
  console.log('=== Nginx listening ports ===');
  const nginxPorts = await ssh.execCommand('cat /www/server/nginx/conf/nginx.conf | grep listen');
  console.log(nginxPorts.stdout);
  
  console.log('=== All processes on port 80 ===');
  const p80 = await ssh.execCommand('lsof -i :80 | head -20');
  console.log(p80.stdout || p80.stderr);
  
  console.log('=== aaPanel web server mode ===');
  const mode = await ssh.execCommand('cat /www/server/panel/vhost/nginx/*.conf | grep "listen 80" | head -5');
  console.log(mode.stdout || mode.stderr);
  
  // Kiểm tra có nginx đang chạy không
  const nginxStatus = await ssh.execCommand('systemctl status nginx 2>&1 | head -10 || service nginx status 2>&1 | head -10');
  console.log('=== Nginx Status ===');
  console.log(nginxStatus.stdout || nginxStatus.stderr);
  
  process.exit(0);
}
fixApacheConflict();
