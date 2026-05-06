const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

function getVpsConnection() {
  const password = process.env.VPS_PASSWORD;
  if (!password) {
    throw new Error('Missing VPS_PASSWORD environment variable.');
  }
  return { host: '103.124.92.238', username: 'root', password };
}

async function runMigration() {
  try {
    await ssh.connect(getVpsConnection());
    console.log('Connected to VPS');

    console.log('=== RUNNING MIGRATION ON VPS ===');
    const result = await ssh.execCommand('cd /www/wwwroot/quanlycms && node migrate_ids.js');
    console.log('STDOUT:', result.stdout);
    console.log('STDERR:', result.stderr);

    console.log('\n=== RESTARTING PM2 ===');
    const restart = await ssh.execCommand('pm2 restart quanlycms');
    console.log(restart.stdout);

    console.log('\n✅ Migration and restart complete');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

runMigration();
