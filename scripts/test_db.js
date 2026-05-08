const mongoose = require('mongoose');
const uri = 'mongodb://127.0.0.1:27017/quanlycms';
console.log('Connecting to:', uri);
mongoose.connect(uri)
  .then(() => {
    console.log('Success!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
