const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function createProxy() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const conf = `server {
    listen 80;
    server_name 103.124.92.238 quanlycms.giasutinhoc24h.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}`;
  await ssh.execCommand(`cat > /www/server/panel/vhost/nginx/103.124.92.238.conf << 'EOF'\n${conf}\nEOF`);
  await ssh.execCommand('nginx -t && systemctl reload nginx');
  console.log('Nginx updated!');
  process.exit(0);
}
createProxy();
