const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

async function uploadDist() {
  try {
    console.log('Connecting...');
    await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'YOUR_VPS_PASSWORD' });
    
    console.log('Uploading dist directory...');
    const localDir = path.join(__dirname, 'QUANLYCMS/client/dist');
    const remoteDir = '/www/wwwroot/quanlycms/client/dist';
    
    // Create remote dir if not exists
    await ssh.execCommand(`mkdir -p ${remoteDir}`);
    
    const failed = [];
    const successful = [];
    
    await ssh.putDirectory(localDir, remoteDir, {
      recursive: true,
      concurrency: 10,
      tick: function(localPath, remotePath, error) {
        if (error) {
          failed.push(localPath);
        } else {
          successful.push(localPath);
        }
      }
    });
    
    console.log(`Successfully uploaded ${successful.length} files.`);
    if (failed.length > 0) {
      console.log(`Failed to upload ${failed.length} files:`, failed);
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

uploadDist();
