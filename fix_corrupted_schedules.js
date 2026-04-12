const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');

mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
    try {
        const res = await Schedule.updateMany(
            { status: 'scheduled', is_paid_to_teacher: true },
            { $set: { is_paid_to_teacher: false, paymentStatus: 'pending' } }
        );
        console.log('Fixed incorrectly paid scheduled sessions:', res);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
