const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkFiles() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  const result = await ssh.execCommand('ls -l /www/wwwroot/quanlycms/client/dist/assets/index-*.js');
  console.log('VPS Index Files:\n', result.stdout);
  
  const indexHtml = await ssh.execCommand('grep "index-" /www/wwwroot/quanlycms/client/dist/index.html');
  console.log('index.html content:\n', indexHtml.stdout);
  
  process.exit(0);
}
checkFiles();
