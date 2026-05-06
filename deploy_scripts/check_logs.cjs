const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkLogs() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('pm2 logs quanlycms --lines 100 --no-colors');
  console.log(result.stdout);
  process.exit(0);
}
checkLogs();
