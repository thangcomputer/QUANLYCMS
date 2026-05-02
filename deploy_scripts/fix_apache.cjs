const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fix() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  // aaPanel có cả Apache (port 80) và Nginx riêng (webserver panel)
  // Cần thêm Apache VirtualHost proxy đến Node.js port 5000
  
  // Kiểm tra Apache VirtualHost hiện có
  console.log('=== Apache vhost files ===');
  const vhosts = await ssh.execCommand('ls /www/server/panel/vhost/apache/');
  console.log(vhosts.stdout || vhosts.stderr);
  
  // Tạo Apache VirtualHost cho IP 103.124.92.238 proxy đến port 5000
  const apacheConf = `<VirtualHost *:80>
    ServerName 103.124.92.238
    ServerAlias quanlycms.giasutinhoc24h.com

    # Enable proxy modules
    ProxyPreserveHost On
    ProxyRequests Off

    # Proxy all requests to Node.js
    ProxyPass /api http://127.0.0.1:5000/api
    ProxyPassReverse /api http://127.0.0.1:5000/api

    ProxyPass /socket.io http://127.0.0.1:5000/socket.io
    ProxyPassReverse /socket.io http://127.0.0.1:5000/socket.io

    # Serve React static files directly
    DocumentRoot /www/wwwroot/quanlycms/client/dist
    <Directory /www/wwwroot/quanlycms/client/dist>
        Options -Indexes
        AllowOverride All
        Require all granted
    </Directory>

    # SPA fallback - redirect 404 to index.html
    FallbackResource /index.html

    ErrorLog /www/wwwlogs/quanlycms_error.log
    CustomLog /www/wwwlogs/quanlycms_access.log combined
</VirtualHost>`;

  await ssh.execCommand(`cat > /www/server/panel/vhost/apache/103.124.92.238.conf << 'APACHEEOF'\n${apacheConf}\nAPACHEEOF`);
  console.log('Apache vhost created!');
  
  // Enable mod_proxy in Apache
  const enableProxy = await ssh.execCommand('/www/server/apache/bin/httpd -M 2>/dev/null | grep proxy');
  console.log('=== Proxy modules ===', enableProxy.stdout || enableProxy.stderr);
  
  // Reload Apache
  const reload = await ssh.execCommand('/www/server/apache/bin/apachectl -t && /www/server/apache/bin/apachectl graceful');
  console.log('=== Apache reload ===', reload.stdout || reload.stderr);
  
  // Check curl
  await new Promise(r => setTimeout(r, 2000));
  const curl = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" http://localhost/');
  console.log('=== HTTP Status code localhost/ ===', curl.stdout);
  
  process.exit(0);
}
fix();
