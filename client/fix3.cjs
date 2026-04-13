const fs = require('fs');
let content = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('bu') && lines[i].includes('i dạy chưa nhận)')) {
        lines[i] = lines[i].replace(/bu[^"]*"i/g, 'buổi');
        lines[i] = lines[i].replace(/bu.*"i/g, 'buổi');
    }
}
content = lines.join('\n');
fs.writeFileSync('src/components/AdminDashboard.jsx', content, 'utf8');
console.log('Fixed syntax error in AdminDashboard.jsx');
