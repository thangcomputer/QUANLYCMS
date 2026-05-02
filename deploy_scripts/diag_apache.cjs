const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixFinal() {
  console.log('🔌 Connecting...');
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  // 1. Xem TẤT CẢ file conf trong thư mục panel vhost apache
  console.log('\n📋 All files in /www/server/panel/vhost/apache/...');
  const listFiles = await ssh.execCommand('ls -la /www/server/panel/vhost/apache/');
  console.log(listFiles.stdout);

  // 2. Tìm port 5001 ở đâu trong các file conf
  console.log('\n📋 Files referencing port 5001...');
  const find5001 = await ssh.execCommand('grep -rl "5001" /www/server/panel/vhost/apache/ 2>/dev/null');
  console.log(find5001.stdout || 'None found');

  // 3. Xem nội dung từng file có chứa port 5001
  if (find5001.stdout.trim()) {
    for (const f of find5001.stdout.trim().split('\n')) {
      console.log(`\n📄 ${f}:`);
      const c = await ssh.execCommand(`cat "${f}"`);
      console.log(c.stdout);
    }
  }

  // 4. Đọc file httpd-vhosts.conf
  console.log('\n📋 /www/server/apache/conf/extra/httpd-vhosts.conf:');
  const vhostsConf = await ssh.execCommand('cat /www/server/apache/conf/extra/httpd-vhosts.conf');
  console.log(vhostsConf.stdout.slice(0, 2000));

  process.exit(0);
}

fixFinal().catch(err => { console.error(err.message); process.exit(1); });
