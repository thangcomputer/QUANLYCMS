const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixFinal() {
  console.log('🔌 Connecting...');
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  // 1. Xem nội dung file vhost hiện tại
  console.log('\n📄 Current dashboard vhost config:');
  const currentConf = await ssh.execCommand('cat /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf');
  console.log(currentConf.stdout);

  // 2. Ghi lại file vhost đúng (port 5000, DocumentRoot đúng)
  console.log('\n📝 Writing correct vhost config...');
  const vhostConfig = `<VirtualHost *:80>
    ServerAdmin webmaster@example.com
    DocumentRoot "/www/wwwroot/quanlycms/client/dist"
    ServerName dashboard.giasutinhoc24h.com
    
    <IfModule mod_proxy.c>
        ProxyRequests Off
        ProxyPreserveHost On

        ProxyPass /api/ http://127.0.0.1:5000/api/
        ProxyPassReverse /api/ http://127.0.0.1:5000/api/

        ProxyPass /socket.io/ http://127.0.0.1:5000/socket.io/
        ProxyPassReverse /socket.io/ http://127.0.0.1:5000/socket.io/
        
        ProxyPass /uploads/ http://127.0.0.1:5000/uploads/
        ProxyPassReverse /uploads/ http://127.0.0.1:5000/uploads/
    </IfModule>

    ErrorLog "/www/wwwlogs/dashboard.giasutinhoc24h.com-error_log"
    CustomLog "/www/wwwlogs/dashboard.giasutinhoc24h.com-access_log" combined

    <Directory "/www/wwwroot/quanlycms/client/dist">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html
        
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api/
        RewriteCond %{REQUEST_URI} !^/socket.io/
        RewriteCond %{REQUEST_URI} !^/uploads/
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>`;

  // Ghi file với tee để tránh heredoc issue
  await ssh.execCommand(`tee /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf > /dev/null << 'HEREDOC'
${vhostConfig}
HEREDOC`);

  // Kiểm tra file đã ghi đúng chưa
  const check = await ssh.execCommand('grep "5000\\|5001\\|DocumentRoot" /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf');
  console.log('Config check (should show 5000):', check.stdout);

  // 3. Restart Apache đúng cách với aaPanel script
  console.log('\n♻️  Restarting Apache via aaPanel...');
  const restart = await ssh.execCommand('/etc/init.d/httpd restart 2>&1');
  console.log(restart.stdout || restart.stderr);

  // 4. Đợi 2 giây rồi kiểm tra
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n📋 Apache process status...');
  const ps = await ssh.execCommand('ps aux | grep httpd | grep -v grep | head -3');
  console.log(ps.stdout || 'Apache not running!');

  // 5. Test
  console.log('\n🧪 Testing...');
  const test1 = await ssh.execCommand('curl -s -o /dev/null -w "API test: %{http_code}" http://127.0.0.1:5000/api/auth/captcha');
  console.log(test1.stdout);
  
  const test2 = await ssh.execCommand('curl -s -o /dev/null -w "Web test (port 80): %{http_code}" http://dashboard.giasutinhoc24h.com/ --resolve "dashboard.giasutinhoc24h.com:80:127.0.0.1"');
  console.log(test2.stdout);

  // 6. Kiểm tra lỗi Apache mới nhất
  console.log('\n📋 Latest Apache errors...');
  const latestErr = await ssh.execCommand('tail -5 /www/server/apache/logs/error_log 2>/dev/null || tail -5 /www/wwwlogs/dashboard.giasutinhoc24h.com-error_log 2>/dev/null');
  console.log(latestErr.stdout);

  console.log('\n✅ Done!');
  process.exit(0);
}

fixFinal().catch(err => { console.error('❌', err.message); process.exit(1); });
