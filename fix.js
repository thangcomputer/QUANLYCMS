const fs = require('fs');
let content = fs.readFileSync('client/src/components/AdminDashboard.jsx', 'utf8');

// Replace standard encoding issues
content = content.replace(/label="T[^"]*ng học viên"/g, 'label="Tổng học viên"');
content = content.replace(/sub=\{\\\\$\{statPaidStudents\}.*ã hoàn tất học phí\\}/g, 'sub={\ đã hoàn tất học phí}');
content = content.replace(/label="T"ng học viên"/g, 'label="Tổng học viên"');
content = content.replace(/sub=\{\\\\$\{statPaidStudents\}  ã hoàn tất học phí\\}/g, 'sub={\ đã hoàn tất học phí}');

// We also need to fix the case where there is a literal double quote inside the string preventing it from compiling!
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ng học viên"')) {
        lines[i] = lines[i].replace(/label="T[^"]*"ng học viên"/g, 'label="Tổng học viên"');
        lines[i] = lines[i].replace(/label="T.*ng học viên"/g, 'label="Tổng học viên"');
    }
}
content = lines.join('\n');

fs.writeFileSync('client/src/components/AdminDashboard.jsx', content, 'utf8');
console.log('Done!');
