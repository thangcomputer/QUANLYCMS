const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  // Check what's listening on all ports
  const result = await ssh.execCommand('netstat -tpln');
  console.log('Netstat:\n', result.stdout);
  
  // Check nginx status
  const result2 = await ssh.execCommand('nginx -T | grep "proxy_pass"');
  console.log('Nginx Active proxy_pass:\n', result2.stdout);
  
  process.exit(0);
}
check();
