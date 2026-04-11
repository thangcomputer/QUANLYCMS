const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  maHoaDon: {
    type: String,
    unique: true,
    required: true
  },
  hocVien: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  hoTen: {
    type: String,
    required: true
  },
  khoaHoc: {
    type: String,
    required: true
  },
  hocPhi: {
    type: Number,
    required: true
  },
  ngayXuat: {
    type: Date,
    default: Date.now
  },
  ghiChu: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Tự động tạo mã hóa đơn
invoiceSchema.pre('save', async function (next) {
  if (!this.maHoaDon) {
    const count = await mongoose.model('Invoice').countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.maHoaDon = `HD${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
