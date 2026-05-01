import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';

/**
 * Xuất hóa đơn từ DOM element sang PDF khổ A5 ngang
 * Đảm bảo con dấu & chữ ký hiển thị đúng vị trí khi in
 *
 * @param {Object} data
 * @param {string} data.studentName - Tên học viên (dùng cho tên file)
 */
const exportPDF = async (data = {}) => {
  const element = document.getElementById('invoice-template');

  if (!element) {
    toast.error('Không tìm thấy mẫu hóa đơn. Vui lòng thử lại.');
    return false;
  }

  try {
    // ── 1. Cố định kích thước element về đúng A5 landscape (mm → px) ──────
    //    A5 landscape: 210mm × 148mm
    //    Quy đổi: 1mm = 3.7795px (ở 72dpi screen)
    //    Với scale=3 (300dpi): 1mm ≈ 11.34px
    const A5_W_MM  = 210;
    const A5_H_MM  = 148;
    const MM_TO_PX = 3.7795275591; // 1mm = px ở 96dpi

    // Lưu style gốc để restore sau
    const originalStyle = {
      width:    element.style.width,
      height:   element.style.height,
      overflow: element.style.overflow,
    };

    // Gán kích thước cứng để html2canvas chụp đúng tỷ lệ A5
    element.style.width    = `${A5_W_MM * MM_TO_PX}px`;
    element.style.height   = `${A5_H_MM * MM_TO_PX}px`;
    element.style.overflow = 'hidden';

    // ── 2. Chụp DOM → canvas với scale 3x (≈ 300dpi in ấn) ───────────────
    const canvas = await html2canvas(element, {
      scale:           3,              // 3x = chất lượng in rõ nét
      useCORS:         true,           // Cho phép load ảnh cross-origin (logo)
      allowTaint:      false,
      backgroundColor: '#ffffff',
      logging:         false,
      // Giữ nguyên kích thước element đã set
      width:  A5_W_MM * MM_TO_PX,
      height: A5_H_MM * MM_TO_PX,
      windowWidth:  A5_W_MM * MM_TO_PX,
      windowHeight: A5_H_MM * MM_TO_PX,
    });

    // Restore style gốc
    element.style.width    = originalStyle.width;
    element.style.height   = originalStyle.height;
    element.style.overflow = originalStyle.overflow;

    // ── 3. Tạo PDF A5 landscape ───────────────────────────────────────────
    const pdf = new jsPDF({
      orientation: 'landscape',  // ngang (rộng × cao = 210mm × 148mm)
      unit:        'mm',
      format:      'a5',
      compress:    true,
    });

    // Kích thước trang PDF chính xác
    const pdfWidth  = pdf.internal.pageSize.getWidth();  // = 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // = 148mm

    // ── 4. Điều chỉnh ảnh fit vừa đúng trang, giữ tỷ lệ ─────────────────
    const imgAspect  = canvas.width / canvas.height;
    const pageAspect = pdfWidth / pdfHeight;

    let drawW, drawH, offsetX = 0, offsetY = 0;

    if (imgAspect > pageAspect) {
      // Ảnh rộng hơn → fit theo chiều rộng
      drawW   = pdfWidth;
      drawH   = pdfWidth / imgAspect;
      offsetY = (pdfHeight - drawH) / 2;
    } else {
      // Ảnh cao hơn → fit theo chiều cao
      drawH   = pdfHeight;
      drawW   = pdfHeight * imgAspect;
      offsetX = (pdfWidth - drawW) / 2;
    }

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH);

    // ── 5. Thêm metadata PDF ──────────────────────────────────────────────
    pdf.setProperties({
      title:    'Hóa Đơn Thu Học Phí - Thắng Tin Học',
      subject:  'Phiếu thu học phí',
      author:   'Trung Tâm Thắng Tin Học',
      keywords: 'hóa đơn, học phí, thắng tin học',
      creator:  'QUANLYCMS v1.0',
    });

    // ── 6. Lưu file ───────────────────────────────────────────────────────
    const studentName = data.studentName || 'HocVien';
    const dateStr     = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    const fileName    = `HoaDon_${studentName.replace(/\s+/g, '_')}_${dateStr}.pdf`;

    pdf.save(fileName);

    return true;

  } catch (error) {
    toast.error('Có lỗi khi xuất PDF. Vui lòng thử lại.');
    return false;
  }
};

/**
 * Hàm in trực tiếp (mở hộp thoại Print của trình duyệt)
 * Đảm bảo chọn đúng khổ A5 ngang trong dialog in
 */
export const printInvoice = () => {
  const element = document.getElementById('invoice-template');
  if (!element) return toast.error('Không tìm thấy mẫu in');

  // Tạo container tạm cho việc in
  const printContainer = document.createElement('div');
  printContainer.id = '__invoice-print-container__';
  
  // Clone element và gỡ bỏ các style có thể gây nhiễu (scale, transform)
  const clone = element.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.margin = '0 auto';
  clone.style.display = 'block';
  clone.style.position = 'relative';
  clone.style.boxShadow = 'none';
  clone.style.border = 'none';
  
  printContainer.appendChild(clone);
  document.body.appendChild(printContainer);

  const style = document.createElement('style');
  style.id = '__invoice-print-style__';
  style.innerHTML = `
    @media print {
      /* Ẩn tất cả ngoại trừ container in */
      body > *:not(#__invoice-print-container__) {
        display: none !important;
      }
      #__invoice-print-container__ {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #invoice-template {
        width: 210mm !important;
        height: 148mm !important;
        border: none !important;
        box-shadow: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: A5 landscape;
        margin: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Gọi lệnh in
  window.print();

  // Dọn dẹp sau khi in
  setTimeout(() => {
    printContainer.remove();
    style.remove();
  }, 1000);
};

export default exportPDF;
