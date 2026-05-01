const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function checkVPS() {
  await ssh.connect({ host: '103.124.92.238', username: 'root', password: 'O6iogp8j46WHDzua' });
  
  const cmd = `node -e "const mongoose=require('mongoose'); const dotenv=require('dotenv'); dotenv.config(); mongoose.connect(process.env.MONGODB_URI).then(async ()=>{const collections = await mongoose.connection.db.listCollections().toArray(); for(let c of collections){ const count = await mongoose.connection.db.collection(c.name).countDocuments(); console.log('Collection:', c.name, 'Count:', count); if(count > 0 && count < 20){ const docs = await mongoose.connection.db.collection(c.name).find({}).toArray(); docs.forEach(d=>console.log('  - Doc:', d.name, d.phone, d.role)); } } process.exit(0);})"`;
  
  const res = await ssh.execCommand(cmd, { cwd: '/www/wwwroot/quanlycms' });
  console.log('STDOUT:', res.stdout);
  
  process.exit(0);
}
checkVPS();
