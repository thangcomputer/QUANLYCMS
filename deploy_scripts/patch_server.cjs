const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function patchServer() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
  
  const patchCmd = `
cat << 'EOF' > patch.js
const fs = require('fs');
let code = fs.readFileSync('/www/wwwroot/quanlycms/server.js', 'utf8');

// Change root route to /api/info
code = code.replace(/app\\.get\\('\\/', \\(req, res\\) => \\{/, "app.get('/api/info', (req, res) => {");

// Add static serving at the end before error handling
const staticCode = \`
// Serve Frontend
const path = require('path');
app.use(express.static(path.join(__dirname, 'client/dist')));
app.get('*', (req, res) => {
  if(req.originalUrl.startsWith('/api')) return res.status(404).json({message: 'Route not found'});
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});
\`;

code = code.replace(/\\/\\/ ==========================================\\r?\\n\\/\\/ ERROR HANDLING/, staticCode + '\\n\\n// ==========================================\\n// ERROR HANDLING');

fs.writeFileSync('/www/wwwroot/quanlycms/server.js', code);
EOF
node patch.js
pm2 restart quanlycms
`;

  await ssh.execCommand(patchCmd);
  console.log('Server patched and restarted!');
  process.exit(0);
}
patchServer();
