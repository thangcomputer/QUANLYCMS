const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function buildClient() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  const res = await ssh.execCommand('npm run build', { cwd: '/www/wwwroot/quanlycms/client' });
  console.log('STDOUT:', res.stdout);
  console.log('STDERR:', res.stderr);
  process.exit(0);
}
buildClient();
