const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function check() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });

  // Check GiasuAI server folder
  console.log('=== 1. GIASUAI SERVER DIR ===');
  const srv = await ssh.execCommand('ls -la /www/wwwroot/giasuai/server/');
  console.log(srv.stdout || srv.stderr);

  // Check if there's a server.js or index.js in server/
  console.log('\n=== 2. SERVER ENTRY FILE ===');
  const entry = await ssh.execCommand('cat /www/wwwroot/giasuai/server/index.js 2>/dev/null || cat /www/wwwroot/giasuai/server/server.js 2>/dev/null || echo "No entry file"');
  console.log(entry.stdout?.substring(0, 500) || entry.stderr);

  // Check giasuai package.json for scripts
  console.log('\n=== 3. PACKAGE.JSON SCRIPTS ===');
  const pkg = await ssh.execCommand('cat /www/wwwroot/giasuai/package.json');
  console.log(pkg.stdout || pkg.stderr);

  // Check giasuai dist/index.html title
  console.log('\n=== 4. DIST INDEX.HTML TITLE ===');
  const title = await ssh.execCommand('head -15 /www/wwwroot/giasuai/dist/index.html');
  console.log(title.stdout || title.stderr);

  process.exit(0);
}
check();
