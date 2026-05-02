# Apache VHost Config cho dashboard.giasutinhoc24h.com
# File thực trên VPS: /www/server/panel/vhost/apache/dashboard.giasutinhoc24h.com.conf
# Cập nhật: 2026-04-27

```apache
<VirtualHost *:80>
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

        # Proxy /api → Node.js backend port 5000
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

        # React SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api/
        RewriteCond %{REQUEST_URI} !^/socket.io/
        RewriteCond %{REQUEST_URI} !^/uploads/
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
```

## Ghi chú VPS

- **IP VPS:** 103.124.92.238
- **Domain:** dashboard.giasutinhoc24h.com
- **Backend chạy tại:** `/www/wwwroot/quanlycms/` (port 5000)
- **Frontend dist tại:** `/www/wwwroot/quanlycms/client/dist/`
- **PM2 app name:** `quanlycms`
- **Web server:** Apache (aaPanel) — không có Nginx
- **Apache config include path:** `/www/server/panel/vhost/apache/*.conf`

## Lệnh hay dùng trên VPS

```bash
# Restart PM2
pm2 restart quanlycms

# Restart Apache
/etc/init.d/httpd restart

# Xem log backend
pm2 logs quanlycms --lines 50

# Xem log Apache
tail -50 /www/server/apache/logs/error_log
```
