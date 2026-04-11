const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/thangtinhoc')
  .then(async () => {
    const AdminUser = require('./models/AdminUser');
    const admin = await AdminUser.findOne({ adminRole: 'SUPER_ADMIN' });
    const jwt = require('jsonwebtoken');
    require('dotenv').config();
    const token = jwt.sign(
      { id: admin._id, name: admin.name, role: 'admin', adminRole: admin.adminRole, branchId: admin.branchId },
      process.env.JWT_SECRET || 'thangtinhoc_secret_kay_2023_safe',
      { expiresIn: '7d' }
    );
    console.log('Fetching with token...');
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/messages/contacts',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
         console.log('Status:', res.statusCode);
         console.log('Body snippet:', data.substring(0, 1500));
         mongoose.disconnect();
      });
    });
    req.on('error', e => console.error(e));
    req.end();
  });
