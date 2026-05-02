const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixWebSocket() {
  console.log('🔌 Connecting...');
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  // 1. Kiểm tra mod_proxy_wstunnel có được compile không
  console.log('\n📋 Checking proxy_wstunnel module...');
  const checkMod = await ssh.execCommand('/www/server/apache/bin/httpd -M 2>&1 | grep -i "proxy"');
  console.log(checkMod.stdout);

  // 2. Kiểm tra LoadModule trong httpd.conf
  console.log('\n📋 Checking LoadModule proxy in httpd.conf...');
  const checkLoad = await ssh.execCommand('grep -i "proxy" /www/server/apache/conf/httpd.conf | grep -i "LoadModule"');
  console.log(checkLoad.stdout || 'No proxy LoadModule found');

  // 3. Ghi vhost mới với WebSocket support đầy đủ
  const vhostConfig = `<VirtualHost *:80>
    ServerAdmin webmaster@example.com
    DocumentRoot "/www/wwwroot/quanlycms/client/dist"
    ServerName dashboard.giasutinhoc24h.com

    <IfModule mod_rewrite.c>
        RewriteEngine On

        # WebSocket proxy cho Socket.io
        RewriteCond %{HTTP:Upgrade} websocket [NC]
        RewriteCond %{HTTP:Connection} upgrade [NC]
        RewriteRule ^/socket.io/(.*) ws://127.0.0.1:5000/socket.io/$1 [P,L]
    </IfModule>

    <IfModule mod_proxy.c>
        ProxyRequests Off
        ProxyPreserveHost On

        # Proxy /api
        ProxyPass /api/ http://127.0.0.1:5000/api/
        ProxyPassReverse /api/ http://127.0.0.1:5000/api/

        # Proxy socket.io (HTTP polling fallback)
        ProxyPass /socket.io/ http://127.0.0.1:5000/socket.io/
        ProxyPassReverse /socket.io/ http://127.0.0.1:5000/socket.io/

        # Proxy uploads
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

  console.log('\n📝 Writing vhost with WebSocket support...');
  const writeResult = await ssh.execCommand(`cat > /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf << 'VHEOF'
${vhostConfig}
VHEOF`);
  console.log(writeResult.stderr || 'Written OK');

  // 4. Bật mod_proxy_wstunnel nếu có dòng bị comment
  console.log('\n⚙️  Enabling proxy_wstunnel in httpd.conf...');
  const enableWs = await ssh.execCommand(`
    sed -i 's/#LoadModule proxy_wstunnel_module/LoadModule proxy_wstunnel_module/g' /www/server/apache/conf/httpd.conf
    grep "proxy_wstunnel" /www/server/apache/conf/httpd.conf
  `);
  console.log(enableWs.stdout || 'Not found in httpd.conf (might be built-in)');

  // 5. Test config
  console.log('\n🔍 Testing Apache config...');
  const testConf = await ssh.execCommand('/www/server/apache/bin/httpd -t 2>&1');
  console.log(testConf.stdout || testConf.stderr);

  // 6. Restart Apache
  console.log('\n♻️  Restarting Apache...');
  const restart = await ssh.execCommand('/etc/init.d/httpd restart 2>&1');
  console.log(restart.stdout);

  await new Promise(r => setTimeout(r, 2000));

  // 7. Test API
  console.log('\n🧪 Testing API...');
  const testApi = await ssh.execCommand('curl -s -o /dev/null -w "API /api/auth/captcha: %{http_code}" http://127.0.0.1/api/auth/captcha --header "Host: dashboard.giasutinhoc24h.com"');
  console.log(testApi.stdout);

  const testCourses = await ssh.execCommand('curl -s -o /dev/null -w "API /api/courses: %{http_code}" http://127.0.0.1/api/courses --header "Host: dashboard.giasutinhoc24h.com"');
  console.log(testCourses.stdout);

  console.log('\n✅ Done! Hãy thử F5 lại trình duyệt.');
  process.exit(0);
}

fixWebSocket().catch(err => { console.error('❌', err.message); process.exit(1); });
