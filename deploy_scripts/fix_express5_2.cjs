const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixExpress5() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  const patchCmd = `
cat << 'EOF' > patch3.js
const fs = require('fs');
let code = fs.readFileSync('/www/wwwroot/quanlycms/server.js', 'utf8');

const oldCode = \`app.use((req, res, next) => {
  if(req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/socket.io')) {
     return next();
  }
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});\`;

const newStaticCode = \`app.use((req, res, next) => {
  if(req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/socket.io')) {
     return next();
  }
  const path = require('path');
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});\`;

code = code.replace(oldCode, newStaticCode);
fs.writeFileSync('/www/wwwroot/quanlycms/server.js', code);
EOF
node patch3.js
pm2 restart quanlycms
`;

  await ssh.execCommand(patchCmd);
  console.log('Server patched properly!');
  process.exit(0);
}
fixExpress5();
