const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixSSL() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  const newConfig = `# ─── HTTP → redirect HTTPS ───
<VirtualHost *:80>
    ServerName dashboard.giasutinhoc24h.com
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

# ─── HTTPS (SSL) ───
<VirtualHost *:443>
    ServerAdmin webmaster@example.com
    DocumentRoot "/www/wwwroot/quanlycms/client/dist"
    ServerName dashboard.giasutinhoc24h.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/dashboard.giasutinhoc24h.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/dashboard.giasutinhoc24h.com/privkey.pem

    <IfModule mod_rewrite.c>
        RewriteEngine On
        RewriteCond %{HTTP:Upgrade} websocket [NC]
        RewriteCond %{HTTP:Connection} upgrade [NC]
        RewriteRule ^/socket.io/(.*) ws://127.0.0.1:5000/socket.io/$1 [P,L]
    </IfModule>

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

    ErrorLog "/www/wwwlogs/dashboard.giasutinhoc24h.com-error_log"
    CustomLog "/www/wwwlogs/dashboard.giasutinhoc24h.com-access_log" combined
</VirtualHost>
`;

  // 1. Backup old config
  console.log('=== 1. BACKUP OLD CONFIG ===');
  const backup = await ssh.execCommand('cp /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf.bak');
  console.log('Backup done');

  // 2. Write new config
  console.log('\n=== 2. WRITE NEW CONFIG ===');
  const write = await ssh.execCommand(`cat > /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf << 'CONFEOF'
${newConfig}
CONFEOF`);
  console.log(write.stdout || write.stderr || 'Config written');

  // 3. Verify config
  console.log('\n=== 3. VERIFY CONFIG ===');
  const verify = await ssh.execCommand('cat /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf');
  console.log(verify.stdout);

  // 4. Test Apache config syntax
  console.log('\n=== 4. APACHE CONFIG TEST ===');
  const test = await ssh.execCommand('/www/server/apache/bin/httpd -t 2>&1');
  console.log(test.stdout || test.stderr);

  // 5. Restart Apache (use aaPanel httpd)
  console.log('\n=== 5. RESTART APACHE ===');
  const restart = await ssh.execCommand('/etc/init.d/httpd restart 2>&1');
  console.log(restart.stdout || restart.stderr);

  // 6. Verify HTTPS works
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n=== 6. CURL HTTPS TEST ===');
  const curlTest = await ssh.execCommand('curl -sk -o /dev/null -w "%{http_code}" https://dashboard.giasutinhoc24h.com/');
  console.log('HTTPS status code:', curlTest.stdout || curlTest.stderr);

  const curlAPI = await ssh.execCommand('curl -sk -o /dev/null -w "%{http_code}" https://dashboard.giasutinhoc24h.com/api/auth/me');
  console.log('API status code:', curlAPI.stdout || curlAPI.stderr);

  process.exit(0);
}
fixSSL();
