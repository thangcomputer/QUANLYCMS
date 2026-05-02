const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

function getVpsConnection() {
  const password = process.env.VPS_PASSWORD;
  if (!password) {
    throw new Error('Missing VPS_PASSWORD environment variable.');
  }
  return { host: '103.124.92.238', username: 'root', password };
}

async function deploy() {
  try {
    console.log('🔗 Connecting to VPS...');
    await ssh.connect(getVpsConnection());
    
    const projectPath = '/www/wwwroot/quanlycms';
    const repoUrl = 'https://github.com/thangcomputer/QUANLYCMS.git';

    console.log('🗑️ Cleaning and Cloning...');
    const tempPath = '/tmp/quanlycms_clone_temp';
    await ssh.execCommand(`rm -rf ${tempPath}`);
    const cloneRes = await ssh.execCommand(`git clone ${repoUrl} ${tempPath}`);
    if (cloneRes.stderr) console.log('Git Clone Log:', cloneRes.stderr);
    
    console.log('🚚 Creating project path and moving files...');
    await ssh.execCommand(`mkdir -p ${projectPath}`);
    // Clear old files
    await ssh.execCommand(`rm -rf ${projectPath}/* ${projectPath}/.[!.]* || true`);
    
    // Move files to project path
    await ssh.execCommand(`cp -r ${tempPath}/* ${projectPath}/`);
    await ssh.execCommand(`cp -r ${tempPath}/.[!.]* ${projectPath}/ || true`);

    console.log('🔑 Setting up .env...');
    const envContent = `PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/quanlycms
JWT_SECRET=thangTinHoc_secret_key_2026
JWT_REFRESH_SECRET=thangTinHoc_refresh_secret_key_2026
JWT_EXPIRES_IN=8h
NODE_ENV=production
CLIENT_URL=http://103.124.92.238
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://103.124.92.238/api/auth/google/callback
ZALO_APP_ID=YOUR_ZALO_APP_ID
ZALO_APP_SECRET=YOUR_ZALO_APP_SECRET
ZALO_CALLBACK_URL=http://103.124.92.238/api/auth/zalo/callback
BANK_ID=ACB
ACCOUNT_NO=4628686
ACCOUNT_NAME=PHI VAN THANG`;

    await ssh.execCommand(`cat > ${projectPath}/.env << 'EOF'
${envContent}
EOF`);

    console.log('⚙️ Installing backend dependencies...');
    const backendRes = await ssh.execCommand('npm install --production', { cwd: projectPath });
    console.log(backendRes.stdout || backendRes.stderr);

    console.log('⚙️ Installing client dependencies and building...');
    const clientRes = await ssh.execCommand('npm install', { cwd: `${projectPath}/client` });
    console.log(clientRes.stdout || clientRes.stderr);
    
    const buildRes = await ssh.execCommand('npm run build', { cwd: `${projectPath}/client` });
    console.log(buildRes.stdout || buildRes.stderr);

    console.log('♻️ Restarting application with PM2...');
    await ssh.execCommand('pm2 stop quanlycms || true', { cwd: projectPath });
    await ssh.execCommand('pm2 delete quanlycms || true', { cwd: projectPath });
    await ssh.execCommand('pm2 start server.js --name "quanlycms"', { cwd: projectPath });
    await ssh.execCommand('pm2 save', { cwd: projectPath });

    console.log('✅ DEPLOYMENT COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Error during deployment:', err);
  } finally {
    process.exit(0);
  }
}

deploy();
