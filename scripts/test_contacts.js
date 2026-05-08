const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
    const Student = mongoose.connection.collection('students');
    const Teacher = mongoose.connection.collection('teachers');
    const students = await Student.find({}).toArray();
    console.log('Students count:', students.length);
    if(students.length > 0) {
        const student = students[0];
        console.log('Test Student ID:', student._id, 'Branch:', student.branchId, 'Teacher:', student.teacherId);
        
        const staffDocs = student.branchId ? await Teacher.find({ adminRole: 'STAFF', branchId: student.branchId }).toArray() : [];
        console.log('Staff found:', staffDocs.length);
        
        const teacherDocs = student.teacherId ? await Teacher.find({ _id: student.teacherId, role: 'teacher' }).toArray() : [];
        console.log('Teachers found:', teacherDocs.length);
    }
    process.exit(0);
});
