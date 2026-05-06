const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('grep "PORT" /www/wwwroot/quanlycms/.env');
  console.log('PORT in quanlycms:\n', result.stdout);
  
  const result2 = await ssh.execCommand('grep "PORT" /www/wwwroot/dashboard.giasutinhoc24h.com/.env');
  console.log('PORT in dashboard:\n', result2.stdout);
  
  process.exit(0);
}
check();
