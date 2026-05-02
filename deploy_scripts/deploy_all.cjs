const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

async function deploy() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  const localDist = path.join(__dirname, 'QUANLYCMS', 'client', 'dist');

  // ══════════════════════════════════════════════════════════
  // PART 1: Upload new QUANLYCMS dist
  // ══════════════════════════════════════════════════════════
  console.log('=== 1. REMOVE OLD DIST ===');
  await ssh.execCommand('rm -rf /www/wwwroot/quanlycms/client/dist');
  console.log('Done');

  console.log('\n=== 2. UPLOAD NEW DIST ===');
  const status = await ssh.putDirectory(localDist, '/www/wwwroot/quanlycms/client/dist', {
    recursive: true,
    concurrency: 5,
    tick: (localPath, remotePath, error) => {
      if (error) console.log('  ❌', path.basename(localPath));
      else console.log('  ✅', path.basename(localPath));
    }
  });
  console.log(status ? '\n✅ Upload successful!' : '\n❌ Upload failed!');

  // ══════════════════════════════════════════════════════════
  // PART 2: Fix giasutinhoc24h.com Apache config
  // Serve GiasuAI static files from dist/ instead of proxying to port 5000
  // GiasuAI has its own backend at server/server.js that needs its own port
  // ══════════════════════════════════════════════════════════
  console.log('\n=== 3. CHECK GIASUAI SERVER PORT ===');
  const giasuPort = await ssh.execCommand('grep -i "port\\|listen" /www/wwwroot/giasuai/server/server.js 2>&1 | head -10');
  console.log(giasuPort.stdout || giasuPort.stderr);

  // Check giasuai .env for PORT
  const giasuEnv = await ssh.execCommand('grep PORT /www/wwwroot/giasuai/.env 2>/dev/null');
  console.log('GiasuAI .env PORT:', giasuEnv.stdout || 'not set');

  // Check if GiasuAI backend is running in PM2
  console.log('\n=== 4. GIASUAI PM2 STATUS ===');
  const pm2 = await ssh.execCommand('pm2 list');
  console.log(pm2.stdout);

  // Fix the giasutinhoc24h.com Apache config to serve static dist files
  // and proxy API to GiasuAI's own backend port (not 5000 which is quanlycms)
  console.log('\n=== 5. FIX GIASUTINHOC24H.COM VHOST ===');

  const newConfig = `<VirtualHost *:80>
    ServerAdmin webmaster@example.com
    DocumentRoot "/www/wwwroot/giasuai/dist"
    ServerName giasutinhoc24h.com
    ServerAlias www.giasutinhoc24h.com

    Alias /.well-known /www/wwwroot/giasuai/.well-known
    <Directory "/www/wwwroot/giasuai/.well-known">
        Options None
        AllowOverride None
        Require all granted
    </Directory>

    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/.well-known
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

    ErrorLog "/www/wwwlogs/giasutinhoc24h.com-error_log"
    CustomLog "/www/wwwlogs/giasutinhoc24h.com-access_log" combined
</VirtualHost>

<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerAdmin webmaster@example.com
    DocumentRoot "/www/wwwroot/giasuai/dist"
    ServerName giasutinhoc24h.com
    ServerAlias www.giasutinhoc24h.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/giasutinhoc24h.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/giasutinhoc24h.com/privkey.pem
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLHonorCipherOrder on

    # Serve static files from dist
    <Directory "/www/wwwroot/giasuai/dist">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.html

        # SPA routing - fallback to index.html
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

    # Proxy /api and /socket.io to GiasuAI backend (port 4000)
    <IfModule mod_proxy.c>
        ProxyRequests Off
        ProxyPreserveHost On

        ProxyPass /api/ http://127.0.0.1:4000/api/
        ProxyPassReverse /api/ http://127.0.0.1:4000/api/

        ProxyPass /socket.io/ http://127.0.0.1:4000/socket.io/
        ProxyPassReverse /socket.io/ http://127.0.0.1:4000/socket.io/

        ProxyPass /uploads/ http://127.0.0.1:4000/uploads/
        ProxyPassReverse /uploads/ http://127.0.0.1:4000/uploads/
    </IfModule>

    <IfModule mod_rewrite.c>
        RewriteEngine On
        RewriteCond %{HTTP:Upgrade} websocket [NC]
        RewriteCond %{HTTP:Connection} upgrade [NC]
        RewriteRule ^/socket.io/(.*) ws://127.0.0.1:4000/socket.io/$1 [P,L]
    </IfModule>

    ErrorLog "/www/wwwlogs/giasutinhoc24h.com-ssl-error_log"
    CustomLog "/www/wwwlogs/giasutinhoc24h.com-ssl-access_log" combined
</VirtualHost>
</IfModule>
`;

  // Backup old config
  await ssh.execCommand('cp /www/server/panel/vhost/apache/giasutinhoc24h.com.conf /www/server/panel/vhost/apache/giasutinhoc24h.com.conf.bak3');

  // Write new config
  const write = await ssh.execCommand(`cat > /www/server/panel/vhost/apache/giasutinhoc24h.com.conf << 'CONFEOF'
${newConfig}
CONFEOF`);
  console.log(write.stderr || 'Config written');

  // Also set GiasuAI to use port 4000 in its .env
  console.log('\n=== 6. SET GIASUAI PORT 4000 ===');
  const addPort = await ssh.execCommand(`
    grep -q "^PORT=" /www/wwwroot/giasuai/.env && sed -i 's/^PORT=.*/PORT=4000/' /www/wwwroot/giasuai/.env || echo "PORT=4000" >> /www/wwwroot/giasuai/.env;
    grep -q "^MONGODB_URI=" /www/wwwroot/giasuai/.env || echo "MONGODB_URI=mongodb://127.0.0.1:27017/giasuai" >> /www/wwwroot/giasuai/.env;
    grep -q "^NODE_ENV=" /www/wwwroot/giasuai/.env || echo "NODE_ENV=production" >> /www/wwwroot/giasuai/.env;
    cat /www/wwwroot/giasuai/.env
  `);
  console.log(addPort.stdout);

  // Start GiasuAI backend on port 4000
  console.log('\n=== 7. START GIASUAI BACKEND ===');
  await ssh.execCommand('pm2 delete giasuai 2>/dev/null');
  const startGiasuai = await ssh.execCommand('cd /www/wwwroot/giasuai && NODE_ENV=production pm2 start server/server.js --name giasuai');
  console.log(startGiasuai.stdout || startGiasuai.stderr);

  // Test Apache config
  console.log('\n=== 8. APACHE CONFIG TEST ===');
  const test = await ssh.execCommand('/www/server/apache/bin/httpd -t 2>&1');
  console.log(test.stdout || test.stderr);

  // Restart Apache
  console.log('\n=== 9. RESTART APACHE ===');
  const restart = await ssh.execCommand('/etc/init.d/httpd restart 2>&1');
  console.log(restart.stdout || restart.stderr);

  // Wait and verify
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== 10. VERIFY ===');
  const v1 = await ssh.execCommand('curl -sk -o /dev/null -w "%{http_code}" https://dashboard.giasutinhoc24h.com/');
  console.log('dashboard HTTPS:', v1.stdout);

  const v2 = await ssh.execCommand('curl -sk https://giasutinhoc24h.com/ 2>&1 | grep "<title>"');
  console.log('giasutinhoc24h.com title:', v2.stdout);

  const v3 = await ssh.execCommand('curl -sk https://dashboard.giasutinhoc24h.com/ 2>&1 | grep "<title>"');
  console.log('dashboard title:', v3.stdout);

  // PM2 save
  console.log('\n=== 11. PM2 STATUS & SAVE ===');
  const pm2final = await ssh.execCommand('pm2 list && pm2 save');
  console.log(pm2final.stdout);

  process.exit(0);
}
deploy();
