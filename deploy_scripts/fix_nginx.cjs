const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixNginx() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  const conf = `server {
    listen 80;
    server_name 103.124.92.238 quanlycms.giasutinhoc24h.com;
    
    root /www/wwwroot/quanlycms/client/dist;
    index index.html index.htm;
    
    # Frontend React App
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Static files (uploads)
    location /uploads/ {
        alias /www/wwwroot/quanlycms/uploads/;
    }

    # Backend API and Socket.io
    location ~ ^/(api|socket\\.io)/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
  
  await ssh.execCommand(`cat > /www/server/panel/vhost/nginx/103.124.92.238.conf << 'EOF'\n${conf}\nEOF`);
  await ssh.execCommand('nginx -t && systemctl reload nginx');
  console.log('Nginx updated for Frontend and Backend!');
  process.exit(0);
}
fixNginx();
