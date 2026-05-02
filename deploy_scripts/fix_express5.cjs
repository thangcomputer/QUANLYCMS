const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function fixExpress5() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  const patchCmd = `
cat << 'EOF' > patch2.js
const fs = require('fs');
let code = fs.readFileSync('/www/wwwroot/quanlycms/server.js', 'utf8');

// Remove the old buggy static code
const oldBuggyCode = \`app.get('*', (req, res) => {
  if(req.originalUrl.startsWith('/api')) return res.status(404).json({message: 'Route not found'});
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});\`;

code = code.replace(oldBuggyCode, '');

// Add the new one using app.use
const newStaticCode = \`
app.use((req, res, next) => {
  if(req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/socket.io')) {
     return next();
  }
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});
\`;

code = code.replace(/\\/\\/ ==========================================\\r?\\n\\/\\/ ERROR HANDLING/, newStaticCode + '\\n\\n// ==========================================\\n// ERROR HANDLING');

fs.writeFileSync('/www/wwwroot/quanlycms/server.js', code);
EOF
node patch2.js
pm2 restart quanlycms
`;

  await ssh.execCommand(patchCmd);
  console.log('Server patched for Express 5!');
  process.exit(0);
}
fixExpress5();
