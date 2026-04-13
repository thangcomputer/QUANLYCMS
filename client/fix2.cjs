const fs = require('fs');
let content = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('} {teachers.filter')) {
        lines[i] = '                        Có {teachers.filter(t => t.practicalFile && t.practicalStatus === \'submitted\').length} file chờ kiểm tra';
    }
}
content = lines.join('\n');

fs.writeFileSync('src/components/AdminDashboard.jsx', content, 'utf8');
console.log('Fixed syntax error in AdminDashboard.jsx');
