const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

const APP_ID     = '4209748442198938192';
const APP_SECRET = 'RG6R40FDJxGQ4xRrKFSW';
const ENV_FILE   = '/www/wwwroot/quanlycms/.env';

ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' }).then(async () => {
  const read = await ssh.execCommand(`cat ${ENV_FILE}`);
  let content = read.stdout || '';

  // Cập nhật ZALO_APP_ID
  if (content.includes('ZALO_APP_ID=')) {
    content = content.replace(/^ZALO_APP_ID=.*/m, `ZALO_APP_ID=${APP_ID}`);
  } else {
    content = content.trimEnd() + `\nZALO_APP_ID=${APP_ID}\n`;
  }

  // Cập nhật ZALO_APP_SECRET
  if (content.includes('ZALO_APP_SECRET=')) {
    content = content.replace(/^ZALO_APP_SECRET=.*/m, `ZALO_APP_SECRET=${APP_SECRET}`);
  } else {
    content = content.trimEnd() + `\nZALO_APP_SECRET=${APP_SECRET}\n`;
  }

  await ssh.execCommand(`cat > ${ENV_FILE} << 'ENVEOF'\n${content}\nENVEOF`);

  // Verify
  const v = await ssh.execCommand(`grep -E "ZALO_APP_ID|ZALO_APP_SECRET" ${ENV_FILE}`);
  console.log('✅ Verify:\n', v.stdout);

  // Restart với update-env để load biến mới
  await ssh.execCommand('pm2 restart quanlycms --update-env && pm2 save');
  console.log('✅ PM2 restarted. Auto-refresh Zalo OA token đã sẵn sàng!');

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
