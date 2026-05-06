const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('tail -n 100 /root/.pm2/logs/quanlycms-error.log');
  console.log('Error Logs:\n', result.stdout);
  
  const result2 = await ssh.execCommand('tail -n 100 /root/.pm2/logs/quanlycms-out.log');
  console.log('Out Logs:\n', result2.stdout);
  
  process.exit(0);
}
check();
