const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkNginx() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  // Try to find the site config
  const result = await ssh.execCommand('ls /www/server/panel/vhost/nginx/*.conf');
  console.log('Configs:\n', result.stdout);
  
  const siteConfig = await ssh.execCommand('cat /www/server/panel/vhost/nginx/dashboard.giasutinhoc24h.com.conf');
  console.log('Site Config:\n', siteConfig.stdout);
  
  process.exit(0);
}
checkNginx();
