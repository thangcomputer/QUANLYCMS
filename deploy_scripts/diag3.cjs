const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fix() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  // aaPanel dùng OpenResty (nginx fork) thay vì nginx
  console.log('=== Tìm OpenResty/Nginx binary ===');
  const find = await ssh.execCommand('ls /www/server/nginx/sbin/ 2>/dev/null; ls /www/server/openresty/nginx/sbin/ 2>/dev/null; which openresty 2>/dev/null');
  console.log(find.stdout || find.stderr);

  console.log('=== Kiểm tra Apache virtual host files ===');
  const apacheVh = await ssh.execCommand('ls /www/server/panel/vhost/apache/ 2>/dev/null | head -20');
  console.log(apacheVh.stdout || apacheVh.stderr);
  
  console.log('=== Kiểm tra web server của aaPanel ===');
  const webServer = await ssh.execCommand('cat /www/server/panel/data/software_list.json 2>/dev/null | grep -i "web server\|nginx\|apache\|openresty" | head -10; ps aux | grep -E "nginx|openresty|httpd|apache" | grep -v grep');
  console.log(webServer.stdout || webServer.stderr);
  
  process.exit(0);
}
fix();
