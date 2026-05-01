const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function buildFrontend() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  console.log('=== INSTALLING DEPENDENCIES (CLIENT) ===');
  const res1 = await ssh.execCommand('npm install', { cwd: '/www/wwwroot/quanlycms/client' });
  console.log(res1.stdout || res1.stderr);
  
  console.log('\n=== BUILDING FRONTEND (CLIENT) ===');
  const res2 = await ssh.execCommand('npm run build', { cwd: '/www/wwwroot/quanlycms/client' });
  console.log(res2.stdout || res2.stderr);
  
  console.log('\n=== RESTARTING PM2 ===');
  await ssh.execCommand('pm2 restart quanlycms');
  
  console.log('\n=== DONE ===');
  process.exit(0);
}
buildFrontend();
