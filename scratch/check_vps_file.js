const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkFile() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const res = await ssh.execCommand('cat routes/messageRoutes.js | grep -n "CONTACTS"', { cwd: '/www/wwwroot/quanlycms' });
  console.log('STDOUT:', res.stdout);
  process.exit(0);
}
checkFile();
