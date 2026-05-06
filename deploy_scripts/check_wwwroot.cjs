const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkDirs() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('ls -ld /www/wwwroot/*');
  console.log(result.stdout);
  process.exit(0);
}
checkDirs();
