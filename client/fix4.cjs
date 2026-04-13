const fs = require('fs');
let content = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    // If line has an ODD number of double quotes, it's definitely broken!
    const numQuotes = (lines[i].match(/"/g) || []).length;
    if (numQuotes % 2 !== 0 && lines[i].includes('=')) {
        // Find the rogue quote. Usually it's \ufffd"i or similar.
        lines[i] = lines[i].replace(/n[^"]*"i dung/g, 'nội dung');
        lines[i] = lines[i].replace(/n.*"i dung/g, 'nội dung');
        
        lines[i] = lines[i].replace(/đ[^"]*"i t/g, 'đối t');
        lines[i] = lines[i].replace(/đ.*"i t/g, 'đối t');

        lines[i] = lines[i].replace(/m[^"]*"i/g, 'mới');
        lines[i] = lines[i].replace(/m.*"i/g, 'mới');
    }
}
content = lines.join('\n');
fs.writeFileSync('src/components/AdminDashboard.jsx', content, 'utf8');
console.log('Fixed syntax error in AdminDashboard.jsx');
