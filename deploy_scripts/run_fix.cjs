const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

async function runFix() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  const projectPath = '/www/wwwroot/quanlycms';
  
  await ssh.execCommand('git pull origin main 2>&1', { cwd: projectPath });

  console.log('🔄 Running check_betho.js on VPS...');
  const runScript = await ssh.execCommand('node check_betho.js 2>&1', { cwd: projectPath });
  console.log(runScript.stdout || runScript.stderr);

  process.exit(0);
}
runFix();
