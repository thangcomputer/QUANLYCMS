const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function runCheck() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  // Upload the check script first
  await ssh.putFile('c:/Users/thang/Desktop/QUANLYCMS/QUANLYCMS/deploy_scripts/check_vps_db.cjs', '/www/wwwroot/quanlycms/check_vps_db.cjs');
  
  const result = await ssh.execCommand('cd /www/wwwroot/quanlycms && node check_vps_db.cjs');
  console.log(result.stdout);
  
  process.exit(0);
}
runCheck();
