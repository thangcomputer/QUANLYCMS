const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');

mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
    try {
        const pending = await Schedule.find({ status: 'completed', is_paid_to_teacher: { $ne: true } });
        console.log(`Unpaid completed schedules: ${pending.length}`);
        
        for (const s of pending) {
            console.log(`- Teacher: ${s.teacherId}, Date: ${s.date}, Grade: ${s.grade}`);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
