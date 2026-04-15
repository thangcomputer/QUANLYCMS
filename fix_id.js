const fs = require('fs');
const path = 'client/src/components/StudentTest.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "updateStudent(student.id, { examProgress: newProgress });",
  "updateStudent(student._id || student.id, { examProgress: newProgress });"
);

fs.writeFileSync(path, content, 'utf8');
console.log("fixed student.id");
