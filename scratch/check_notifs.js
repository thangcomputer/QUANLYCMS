const mongoose = require('mongoose');
const Notification = require('../models/Notification');

async function check() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/quanlycms');
    console.log('Connected to MongoDB');
    
    const notifs = await Notification.find({ path: { $regex: /admin/ } })
      .sort({ createdAt: -1 })
      .limit(50);
    
    console.log(`Found ${notifs.length} notifications with "admin" in path`);
    notifs.forEach(n => {
        console.log(`- ID: ${n._id}, Title: ${n.title}, Path: "${n.path}"`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
