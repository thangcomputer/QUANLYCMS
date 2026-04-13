const fs = require('fs');
let content = fs.readFileSync('client/src/components/AdminDashboard.jsx', 'utf8');

const replacements = [
    [/x } \{teachers\.filter/g, 'Có {teachers.filter'],
    [/x } \{teachers\.filter/g, 'Có {teachers.filter'],
    [/\x \} \{teachers\.filter/g, 'Có {teachers.filter'],
    [/.*x \} \{teachers\.filter/g, '                        Có {teachers.filter']
];

for(let [regex, replace] of replacements) {
    content = content.replace(regex, replace);
}

fs.writeFileSync('client/src/components/AdminDashboard.jsx', content, 'utf8');
console.log('Fixed syntax error in AdminDashboard.jsx');
