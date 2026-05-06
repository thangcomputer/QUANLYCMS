const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('sed -n "350,450p" /www/wwwroot/quanlycms/routes/messageRoutes.js');
  console.log('File content (350-450):\n', result.stdout);
  process.exit(0);
}
check();
