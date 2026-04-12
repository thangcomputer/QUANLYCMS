const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');

mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
    try {
        const pendingSessions = await Schedule.find({
            teacherId: '69db90490641d2af0eeb0e8e',
            status: 'completed',
            is_paid_to_teacher: { $ne: true }
        }).sort({ date: 1, createdAt: 1 }).limit(2);
        
        console.log(`Found ${pendingSessions.length} pending sessions for this teacher`);
        
        const sessionIds = pendingSessions.map(s => s._id);
        if (sessionIds.length > 0) {
            const updateResult = await Schedule.updateMany(
                { _id: { $in: sessionIds } },
                { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
            );
            console.log('Update Result:', updateResult);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
