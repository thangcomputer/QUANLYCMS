const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/quanlycms', {}).then(async () => {
    try {
        const Teacher = require('./models/Teacher');
        const Student = require('./models/Student');
        
        const req = { user: { role: 'admin', adminRole: 'SUPER_ADMIN', branchId: null } };
        
        const userRole = req.user.role; // admin (SUPER_ADMIN / STAFF)
        const adminRole = req.user.adminRole; // SUPER_ADMIN or STAFF
        const userBranchId = req.user.branchId;

        let students = [];
        let teachers = [];
        let staff = [];
        const superAdmins = await Teacher.find({ adminRole: 'SUPER_ADMIN' }, 'name role').lean();
        console.log("superAdmins: ", superAdmins.length);
        const adminContacts = superAdmins.map(admin => ({
          id: 'admin', // use generic admin id for chat routing
          name: admin.name || 'Admin Thắng Tin Học',
          role: 'admin',
          avatar: 'AD'
        }));

        if (adminRole === 'SUPER_ADMIN' || !adminRole) {
          students = await Student.find({}, 'name role branchId phone').lean();
          teachers = await Teacher.find({ status: { $in: ['Active', 'active'] }, role: 'teacher' }, 'name role branchId phone').lean();
          staff = await Teacher.find({ adminRole: 'STAFF' }, 'name role branchId phone').lean();
        } else if (adminRole === 'STAFF') {
          students = await Student.find({ branchId: userBranchId }, 'name role branchId phone').lean();
          teachers = await Teacher.find({ branchId: userBranchId, status: { $in: ['Active', 'active'] }, role: 'teacher' }, 'name role branchId phone').lean();
          staff = await Teacher.find({ adminRole: 'STAFF', branchId: userBranchId }, 'name role branchId phone').lean();
        }

        const mapContact = (c, role) => ({
          id: c._id.toString(),
          name: c.name,
          role: role,
          phone: c.phone || '',
          avatar: String(c.name || 'U').substring(0, 2).toUpperCase()
        });

        const contacts = [
          ...adminContacts,
          ...staff.map(s => mapContact(s, 'admin')),
          ...teachers.map(t => mapContact(t, 'teacher')),
          ...students.map(s => mapContact(s, 'student'))
        ];
        console.log("Contacts count: ", contacts.length);
    } catch(e) {
        console.log(e);
    }
    process.exit(0);
});
