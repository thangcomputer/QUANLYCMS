const { jsPDF } = require('jspdf');

/**
 * Format số tiền sang định dạng VNĐ
 * @param {number} amount - Số tiền
 * @returns {string} - Chuỗi tiền định dạng
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

/**
 * Format ngày sang định dạng dd/MM/yyyy
 * @param {Date} date - Ngày cần format
 * @returns {string} - Chuỗi ngày định dạng
 */
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Đọc số tiền thành chữ tiếng Việt (không dấu - ASCII safe)
 * @param {number} amount - Số tiền
 * @returns {string} - Chuỗi chữ
 */
function docSoTienKhongDau(amount) {
  const donVi = ['', 'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin'];
  const hangChuc = ['', 'muoi', 'hai muoi', 'ba muoi', 'bon muoi', 'nam muoi', 'sau muoi', 'bay muoi', 'tam muoi', 'chin muoi'];

  if (amount === 0) return 'Khong dong';

  let result = '';
  const trieu = Math.floor(amount / 1000000);
  const ngan = Math.floor((amount % 1000000) / 1000);
  const donViSo = amount % 1000;

  if (trieu > 0) {
    const tram = Math.floor(trieu / 100);
    const chuc = Math.floor((trieu % 100) / 10);
    const dv = trieu % 10;
    if (tram > 0) result += donVi[tram] + ' tram ';
    if (chuc > 0) result += hangChuc[chuc] + ' ';
    if (dv > 0) result += donVi[dv] + ' ';
    result += 'trieu ';
  }

  if (ngan > 0) {
    const tram = Math.floor(ngan / 100);
    const chuc = Math.floor((ngan % 100) / 10);
    const dv = ngan % 10;
    if (tram > 0) result += donVi[tram] + ' tram ';
    else if (trieu > 0) result += 'khong tram ';
    if (chuc > 0) result += hangChuc[chuc] + ' ';
    else if (tram > 0 && dv > 0) result += 'le ';
    if (dv > 0) result += donVi[dv] + ' ';
    result += 'nghin ';
  }

  if (donViSo > 0) {
    const tram = Math.floor(donViSo / 100);
    const chuc = Math.floor((donViSo % 100) / 10);
    const dv = donViSo % 10;
    if (tram > 0) result += donVi[tram] + ' tram ';
    else if (ngan > 0 || trieu > 0) result += 'khong tram ';
    if (chuc > 0) result += hangChuc[chuc] + ' ';
    else if (tram > 0 && dv > 0) result += 'le ';
    if (dv > 0) result += donVi[dv] + ' ';
  }

  result += 'dong';
  // Viết hoa chữ cái đầu
  return result.charAt(0).toUpperCase() + result.slice(1).trim();
}

/**
 * Vẽ đường kẻ ngang
 */
function drawLine(doc, y, x1, x2) {
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

/**
 * Vẽ đường kẻ đôi (double line)
 */
function drawDoubleLine(doc, y, x1, x2) {
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(0.4);
  doc.line(x1, y, x2, y);
  doc.line(x1, y + 1, x2, y + 1);
}

/**
 * Tạo hóa đơn PDF khổ A5
 * @param {Object} data - Dữ liệu hóa đơn
 * @param {string} data.maHoaDon - Mã hóa đơn
 * @param {string} data.hoTen - Họ tên học viên
 * @param {string} data.khoaHoc - Tên khóa học
 * @param {number} data.hocPhi - Học phí
 * @param {Date} data.ngayXuat - Ngày xuất hóa đơn
 * @param {string} [data.ghiChu] - Ghi chú
 * @returns {ArrayBuffer} - Buffer của file PDF
 */
function generateInvoicePDF(data) {
  // Khổ A5: 148mm x 210mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5'
  });

  const pageWidth = 148;
  const marginLeft = 12;
  const marginRight = 12;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const centerX = pageWidth / 2;

  let y = 12;

  // ==========================================
  // HEADER - Thông tin trung tâm
  // ==========================================

  // Viền trên trang trí
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(1.5);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  doc.setDrawColor(52, 152, 219);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, y + 2, pageWidth - marginRight, y + 2);

  y += 8;

  // Tên trung tâm
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  doc.text('TRUNG TAM THANG TIN HOC', centerX, y, { align: 'center' });

  y += 5;

  // Địa chỉ & liên hệ
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Dia chi: Thanh pho Ho Chi Minh', centerX, y, { align: 'center' });
  y += 3.5;
  doc.text('Dien thoai: 0xxx.xxx.xxx  |  Email: thangtinhoc@gmail.com', centerX, y, { align: 'center' });

  y += 6;

  // ==========================================
  // TITLE - Tiêu đề hóa đơn
  // ==========================================

  // Nền cho tiêu đề
  doc.setFillColor(41, 128, 185);
  doc.roundedRect(marginLeft, y, contentWidth, 10, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('HOA DON HOC PHI', centerX, y + 7, { align: 'center' });

  y += 15;

  // Mã hóa đơn & ngày
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`So: ${data.maHoaDon}`, marginLeft, y);
  doc.text(`Ngay: ${formatDate(data.ngayXuat)}`, pageWidth - marginRight, y, { align: 'right' });

  y += 6;
  drawLine(doc, y, marginLeft, pageWidth - marginRight);
  y += 5;

  // ==========================================
  // BODY - Thông tin chi tiết
  // ==========================================

  const labelX = marginLeft;
  const valueX = marginLeft + 30;

  // Họ tên học viên
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(44, 62, 80);
  doc.text('Ho ten:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(44, 62, 80);
  doc.text(data.hoTen || '', valueX, y);

  y += 7;

  // Khóa học
  doc.setFont('helvetica', 'bold');
  doc.text('Khoa hoc:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.khoaHoc || '', valueX, y);

  y += 7;

  // Ngày đăng ký
  doc.setFont('helvetica', 'bold');
  doc.text('Ngay dang ky:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(data.ngayXuat), valueX, y);

  y += 8;
  drawLine(doc, y, marginLeft, pageWidth - marginRight);
  y += 6;

  // ==========================================
  // BẢNG CHI TIẾT HỌC PHÍ
  // ==========================================

  // Header bảng
  doc.setFillColor(236, 240, 241);
  doc.rect(marginLeft, y - 3, contentWidth, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(44, 62, 80);
  doc.text('STT', marginLeft + 3, y + 2);
  doc.text('Noi dung', marginLeft + 18, y + 2);
  doc.text('Thanh tien', pageWidth - marginRight - 3, y + 2, { align: 'right' });

  y += 8;
  drawLine(doc, y, marginLeft, pageWidth - marginRight);
  y += 5;

  // Dòng 1: Học phí
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('1', marginLeft + 5, y);
  doc.text(`Hoc phi - ${data.khoaHoc || 'Khoa hoc'}`, marginLeft + 18, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.hocPhi), pageWidth - marginRight - 3, y, { align: 'right' });

  y += 8;
  drawLine(doc, y, marginLeft, pageWidth - marginRight);
  y += 5;

  // Tổng cộng
  doc.setFillColor(41, 128, 185);
  doc.roundedRect(marginLeft, y - 3, contentWidth, 9, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('TONG CONG:', marginLeft + 5, y + 3);
  doc.setFontSize(10);
  doc.text(formatCurrency(data.hocPhi), pageWidth - marginRight - 5, y + 3, { align: 'right' });

  y += 12;

  // Bằng chữ
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  const soTienChu = docSoTienKhongDau(data.hocPhi);
  doc.text(`Bang chu: ${soTienChu}`, marginLeft, y);

  y += 6;

  // Ghi chú (nếu có)
  if (data.ghiChu) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Ghi chu: ${data.ghiChu}`, marginLeft, y);
    y += 6;
  }

  y += 3;
  drawDoubleLine(doc, y, marginLeft, pageWidth - marginRight);

  // ==========================================
  // FOOTER - Chữ ký
  // ==========================================

  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const ngayKy = new Date(data.ngayXuat);
  doc.text(
    `Ngay ${ngayKy.getDate()} thang ${ngayKy.getMonth() + 1} nam ${ngayKy.getFullYear()}`,
    pageWidth - marginRight,
    y,
    { align: 'right' }
  );

  y += 6;

  // Cột chữ ký
  const col1X = marginLeft + 15;
  const col2X = pageWidth - marginRight - 25;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(44, 62, 80);
  doc.text('Nguoi nop tien', col1X, y, { align: 'center' });
  doc.text('Nguoi thu tien', col2X, y, { align: 'center' });

  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text('(Ky, ghi ro ho ten)', col1X, y, { align: 'center' });
  doc.text('(Ky, ghi ro ho ten)', col2X, y, { align: 'center' });

  // Viền dưới trang trí
  const pageHeight = 210;
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(1.5);
  doc.line(marginLeft, pageHeight - 10, pageWidth - marginRight, pageHeight - 10);
  doc.setDrawColor(52, 152, 219);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, pageHeight - 8, pageWidth - marginRight, pageHeight - 8);

  // Footer text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text('Trung tam Thang Tin Hoc - Cam on ban da tin tuong va dong hanh!', centerX, pageHeight - 5, { align: 'center' });

  // Trả về ArrayBuffer
  return doc.output('arraybuffer');
}

module.exports = { generateInvoicePDF, formatCurrency, formatDate };
