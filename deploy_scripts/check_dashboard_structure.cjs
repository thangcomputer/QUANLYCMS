const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('ls -R /www/wwwroot/dashboard.giasutinhoc24h.com');
  console.log(result.stdout);
  process.exit(0);
}
check();
