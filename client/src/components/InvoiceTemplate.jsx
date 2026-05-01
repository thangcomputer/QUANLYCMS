import React from 'react';

/**
 * Đọc số tiền thành chữ tiếng Việt
 */
function docSoTien(amount) {
  const mangSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function docHangChuc(so) {
    const chuc = Math.floor(so / 10);
    const donVi = so % 10;
    let result = '';
    if (chuc === 0) {
      return mangSo[donVi];
    }
    if (chuc === 1) {
      result = 'mười';
    } else {
      result = mangSo[chuc] + ' mươi';
    }
    if (donVi === 0) return result;
    if (donVi === 1 && chuc > 1) return result + ' mốt';
    if (donVi === 5 && chuc > 0) return result + ' lăm';
    return result + ' ' + mangSo[donVi];
  }

  function docHangTram(so) {
    const tram = Math.floor(so / 100);
    const duoi = so % 100;
    let result = mangSo[tram] + ' trăm';
    if (duoi === 0) return result;
    if (duoi < 10) return result + ' lẻ ' + mangSo[duoi];
    return result + ' ' + docHangChuc(duoi);
  }

  function docBaChuSo(so) {
    if (so === 0) return '';
    if (so < 10) return mangSo[so];
    if (so < 100) return docHangChuc(so);
    return docHangTram(so);
  }

  if (amount === 0) return 'Không đồng';

  let result = '';
  const trieu = Math.floor(amount / 1000000);
  const ngan = Math.floor((amount % 1000000) / 1000);
  const donVi = amount % 1000;

  if (trieu > 0) {
    result += docBaChuSo(trieu) + ' triệu';
  }
  if (ngan > 0) {
    if (result) result += ', ';
    result += docBaChuSo(ngan) + ' nghìn';
  }
  if (donVi > 0) {
    if (result) result += ', ';
    result += docBaChuSo(donVi);
  }

  result += ' đồng';
  // Viết hoa chữ đầu
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Format số tiền
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount);
}

/**
 * InvoiceTemplate - Hóa đơn thu học phí khổ A5 ngang
 * Thiết kế giống hệt mẫu Trung tâm Thắng Tin Học
 */
const InvoiceTemplate = ({ data = {} }) => {
  const {
    studentName = '',
    courseName = '',
    tuitionFee = 0,
    date = new Date(),
    receiverName = 'Hồ Thị Nga',
    isPaid = true
  } = data;

  const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");
  const [invoiceSettings, setInvoiceSettings] = React.useState({
    logo: '',
    signature: '',
    stamp: 'ĐÃ THANH TOÁN'
  });

  React.useEffect(() => {
    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          const { invoiceLogoUrl, invoiceSignatureUrl, invoiceStampText, logoUrl } = res.data;
          const logo = invoiceLogoUrl || logoUrl || '';
          setInvoiceSettings({
            logo: logo.startsWith('http') ? logo : (logo ? `${API}${logo}` : ''),
            signature: invoiceSignatureUrl ? (invoiceSignatureUrl.startsWith('http') ? invoiceSignatureUrl : `${API}${invoiceSignatureUrl}`) : '',
            stamp: invoiceStampText || 'ĐÃ THANH TOÁN'
          });
        }
      })
      .catch(() => {});
  }, []);

  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  return (
    <div
      id="invoice-template"
      className="relative bg-[#fdfdfd] shadow-inner print:shadow-none"
      style={{
        width: '210mm',
        height: '148mm',
        fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        color: '#1a1a1a',
        padding: '8mm',
        boxSizing: 'border-box',
        border: '1px solid #eee'
      }}
    >
      {/* ===== CLASSIC DOUBLE BORDER ===== */}
      <div className="absolute inset-[3mm] border-[0.5mm] border-[#d32f2f] pointer-events-none" />
      <div className="absolute inset-[4.5mm] border-[0.1mm] border-[#d32f2f] opacity-40 pointer-events-none" />

      <div className="relative h-full flex flex-col p-[4mm] border-[0.2mm] border-[#d32f2f] border-opacity-10">
        
        {/* ===== HEADER SECTION ===== */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4">
            <img
              src={invoiceSettings.logo || "/logo-thang-tin-hoc.svg"}
              alt="Logo"
              style={{ height: '22mm', maxWidth: '45mm', objectFit: 'contain' }}
              crossOrigin="anonymous"
            />
            <div className="border-l border-gray-200 pl-4 h-full">
              <h2 className="font-black italic text-[#d32f2f]" style={{ fontSize: '18pt', lineHeight: '1.1' }}>
                TRUNG TÂM ĐÀO TẠO TIN HỌC<br />
                <span style={{ fontSize: '22pt' }}>THẮNG TIN HỌC</span>
              </h2>
              <p className="text-[8.5pt] text-gray-500 font-medium mt-1">Phát triển tri thức Việt - Vươn tầm công nghệ</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[#d32f2f] font-black italic mb-1" style={{ fontSize: '24pt' }}>PHIẾU THU</div>
            <div className="text-[9pt] font-bold text-gray-400">Số: PK_{Date.now().toString().slice(-6)}</div>
          </div>
        </div>

        {/* ===== CONTACT INFO ===== */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-[9pt] border-b border-gray-100 pb-4">
           <div className="space-y-1">
              <div><span className="font-bold text-gray-400 uppercase w-20 inline-block text-[7.5pt]">Địa chỉ:</span> 13Q Phan Cát Tựu, An Lạc, Bình Tân, HCM</div>
              <div><span className="font-bold text-gray-400 uppercase w-20 inline-block text-[7.5pt]">Website:</span> <span className="text-blue-600 font-bold">thangcomputer.com</span></div>
           </div>
           <div className="text-right space-y-1">
              <div><span className="font-bold text-gray-400 uppercase text-[7.5pt]">Hotline:</span> <span className="text-[#d32f2f] font-black ml-2">093-5758-462 | 0348-051-379</span></div>
              <div><span className="font-bold text-gray-400 uppercase text-[7.5pt]">Email:</span> hotro@thangcomputer.com</div>
           </div>
        </div>

        {/* ===== CONTENT SECTION ===== */}
        <div className="flex-grow space-y-5 px-4">
          <div className="flex items-end gap-3">
             <span className="font-bold text-gray-500 uppercase text-[9pt] pb-1">Họ tên người nộp:</span>
             <span className="flex-grow border-b border-dotted border-gray-300 font-bold text-[14pt] text-blue-900 pb-0.5 px-2">
               {studentName.toUpperCase()}
             </span>
          </div>

          <div className="flex items-end gap-3">
             <span className="font-bold text-gray-500 uppercase text-[9pt] pb-1">Nội dung thu:</span>
             <span className="flex-grow border-b border-dotted border-gray-300 font-bold text-[13pt] pb-0.5 px-2">
               {courseName}
             </span>
          </div>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-5 flex items-end gap-3">
               <span className="font-bold text-gray-500 uppercase text-[9pt] pb-1">Số tiền:</span>
               <span className="flex-grow border-b border-dotted border-gray-300 font-black text-[16pt] text-[#d32f2f] pb-0.5 px-2">
                 {formatCurrency(tuitionFee)} VNĐ
               </span>
            </div>
            <div className="col-span-7 flex items-end gap-3">
               <span className="font-bold text-gray-500 uppercase text-[9pt] pb-1">Bằng chữ:</span>
               <span className="flex-grow border-b border-dotted border-gray-300 italic font-bold text-[10.5pt] text-[#d32f2f] pb-0.5 px-2">
                 {docSoTien(tuitionFee)}
               </span>
            </div>
          </div>
        </div>

        {/* ===== SIGNATURE SECTION ===== */}
        <div className="mt-8 flex justify-between items-start">
          <div className="pl-10">
             <div className="text-[#d32f2f] font-black italic text-[10pt] border-b-2 border-[#d32f2f] inline-block mb-4">Lưu ý: Không hoàn học phí</div>
             {isPaid && (
               <div className="relative mt-2">
                  <div className="absolute top-[-10mm] left-[-5mm] w-[45mm] h-[18mm] border-[1.5mm] border-[#d32f2f] border-double rounded-lg flex items-center justify-center rotate-[-10deg] opacity-80 scale-110">
                    <span className="font-black text-[#d32f2f] text-[13pt] tracking-[2px]">{invoiceSettings.stamp}</span>
                  </div>
               </div>
             )}
          </div>

          <div className="text-center min-w-[60mm]">
             <p className="italic text-[9.5pt] mb-1">TP. Hồ Chí Minh, ngày {day} tháng {month} năm {year}</p>
             <p className="font-black text-[10pt] uppercase mb-1">Người nhận tiền</p>
             <p className="text-[8pt] text-gray-400 italic mb-2">(Ký và ghi rõ họ tên)</p>
             
             <div className="h-[22mm] flex items-center justify-center relative">
                {invoiceSettings.signature ? (
                  <img 
                    src={invoiceSettings.signature} 
                    alt="Signature" 
                    className="max-h-[22mm] object-contain relative z-10" 
                    crossOrigin="anonymous" 
                  />
                ) : (
                  <div className="font-['Dancing_Script'] text-[24pt] text-blue-800 opacity-50">
                    {receiverName.split(' ').pop()}
                  </div>
                )}
             </div>

             <p className="font-black text-[11pt] text-gray-800 mt-2">{receiverName}</p>
          </div>
        </div>

        {/* ===== WATERMARK SECTION ===== */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-15deg]">
           <div className="text-[80pt] font-black whitespace-nowrap">THẮNG TIN HỌC</div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceTemplate;
export { docSoTien, formatCurrency };
