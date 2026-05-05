const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

async function fullDeploy() {
  try {
    console.log('🚀 BẮT ĐẦU QUY TRÌNH DEPLOY TOÀN DIỆN...');
    
    await ssh.connect({
      host: '103.124.92.238',
      username: 'root',
      password: 'Vanthang_19952610'
    });
    console.log('✅ Đã kết nối tới VPS.');

    // 1. Đồng bộ Backend từ GitHub
    console.log('\n=== 1. CẬP NHẬT BACKEND (GIT PULL) ===');
    const pull = await ssh.execCommand('cd /www/wwwroot/quanlycms && git pull origin main');
    console.log(pull.stdout || pull.stderr);

    // 2. Cài đặt thư viện mới (nếu có)
    console.log('\n=== 2. CÀI ĐẶT DEPENDENCIES ===');
    const install = await ssh.execCommand('cd /www/wwwroot/quanlycms && npm install --production');
    console.log(install.stdout || 'Dependencies updated.');

    // 3. Upload Frontend Dist
    console.log('\n=== 3. UPLOAD FRONTEND (DIST) ===');
    const localDist = path.join(process.cwd(), 'client', 'dist');
    const remoteDist = '/www/wwwroot/quanlycms/client/dist';
    
    // Xóa dist cũ trên VPS
    await ssh.execCommand(`rm -rf ${remoteDist}`);
    
    await ssh.putDirectory(localDist, remoteDist, {
      recursive: true,
      concurrency: 10
    });
    console.log('✅ Đã upload giao diện mới.');

    // 4. Khởi động lại Server
    console.log('\n=== 4. RESTART SERVER (PM2) ===');
    const restart = await ssh.execCommand('pm2 restart quanlycms');
    console.log(restart.stdout || restart.stderr);
    
    await ssh.execCommand('pm2 save');
    console.log('\n✨ DEPLOY THÀNH CÔNG! Website của bạn đã được bảo mật và sửa lỗi.');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ LỖI DEPLOY:', err.message);
    process.exit(1);
  }
}

fullDeploy();
