/**
 * run_on_vps.cjs - Chạy lệnh deploy trực tiếp lên VPS qua SSH
 * node run_on_vps.cjs
 */
const { NodeSSH } = require('node-ssh');

const ssh = new NodeSSH();

const VPS_HOST = '103.124.92.238';
const VPS_USER = 'root';
const VPS_PORT = 22;

// Điền mật khẩu VPS vào đây
const VPS_PASSWORD = process.env.VPS_PASSWORD || '';

async function run() {
  console.log('🔌 Đang kết nối VPS...');

  try {
    await ssh.connect({
      host: VPS_HOST,
      username: VPS_USER,
      port: VPS_PORT,
      password: VPS_PASSWORD,
      readyTimeout: 10000,
    });
    console.log('✅ Kết nối thành công!\n');
  } catch (err) {
    console.error('❌ Kết nối thất bại:', err.message);
    console.log('\n💡 Hãy vào Terminal aaPanel và chạy thủ công:');
    printManualInstructions();
    process.exit(1);
  }

  const commands = [
    'cd /www/wwwroot/quanlycms && git pull origin main',
    'grep -c "SEPAY_API_KEY" /www/wwwroot/quanlycms/.env || echo "0"',
    'grep "SEPAY_API_KEY" /www/wwwroot/quanlycms/.env || echo "SEPAY_API_KEY=242e95ecf8a42c8b2a4da8e767aae3fb2998b61d73322c45" >> /www/wwwroot/quanlycms/.env && echo "SEPAY_API_KEY added"',
    'pm2 restart quanlycms',
    'pm2 list',
  ];

  for (const cmd of commands) {
    console.log(`\n▶ ${cmd}`);
    const result = await ssh.execCommand(cmd);
    if (result.stdout) console.log(result.stdout);
    if (result.stderr && !result.stderr.includes('Warning')) console.error('STDERR:', result.stderr);
  }

  ssh.dispose();
  console.log('\n✅ Hoàn tất! Hệ thống đã được cập nhật và restart.');
}

function printManualInstructions() {
  console.log(`
═══════════════════════════════════════════════════
  HƯỚNG DẪN CHẠY THỦ CÔNG (copy từng dòng vào Terminal)
═══════════════════════════════════════════════════
cd /www/wwwroot/quanlycms
git pull origin main
grep "SEPAY_API_KEY" .env || echo 'SEPAY_API_KEY=242e95ecf8a42c8b2a4da8e767aae3fb2998b61d73322c45' >> .env
pm2 restart quanlycms
pm2 list
═══════════════════════════════════════════════════
`);
}

run().catch(err => {
  console.error('Lỗi:', err.message);
  printManualInstructions();
});
