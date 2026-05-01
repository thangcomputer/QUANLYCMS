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
    stamp: 'ĐÃ THU PHÍ'
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
            stamp: invoiceStampText || 'ĐÃ THU PHÍ'
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
      className="relative bg-white"
      style={{
        width: '210mm',
        height: '148mm',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        color: '#1a1a1a',
        padding: '6mm',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* ===== VIỀN ĐỎ BAO QUANH ===== */}
      <div className="absolute inset-[2mm] border-[0.5mm] border-[#d32f2f] pointer-events-none" />
      <div className="absolute inset-[3mm] border-[0.1mm] border-[#d32f2f] opacity-30 pointer-events-none" />

      <div className="relative h-full flex flex-col p-[2mm]">
        
        {/* ===== HEADER SECTION (3 COLUMNS) ===== */}
        <div className="flex justify-between items-center mb-4">
          {/* Logo */}
          <div className="w-[25%]">
            <img
              src={invoiceSettings.logo || "/logo-thang-tin-hoc.svg"}
              alt="Logo"
              style={{ height: '18mm', maxWidth: '100%', objectFit: 'contain' }}
              crossOrigin="anonymous"
            />
          </div>

          {/* Center Title */}
          <div className="w-[50%] text-center px-2">
            <h2 className="font-bold italic leading-tight text-[#d32f2f]" style={{ fontSize: '15pt' }}>
              TRUNG TÂM ĐÀO TẠO TIN HỌC
            </h2>
            <h1 className="font-black italic leading-tight text-[#d32f2f]" style={{ fontSize: '20pt' }}>
              THẮNG TIN HỌC
            </h1>
            <p className="text-[7.5pt] font-medium text-gray-500 mt-1">Phát triển tri thức Việt - Vươn tầm công nghệ</p>
          </div>

          {/* Right Label */}
          <div className="w-[25%] text-right">
            <div className="text-[#d32f2f] font-black italic" style={{ fontSize: '20pt', lineHeight: '1' }}>
              PHIẾU<br />THU
            </div>
            <div className="text-[8.5pt] font-bold text-gray-400 mt-2">Số: PK_{Date.now().toString().slice(-6)}</div>
          </div>
        </div>

        {/* ===== CONTACT INFO (2 COLUMNS) ===== */}
        <div className="grid grid-cols-2 gap-x-8 mb-6 text-[8pt] text-gray-600 border-b border-gray-100 pb-2 px-4">
           <div className="space-y-1">
              <div className="flex"><span className="font-bold w-16 uppercase text-gray-400">Địa chỉ:</span> 13Q Phan Cát Tựu, An Lạc, Bình Tân, HCM</div>
              <div className="flex"><span className="font-bold w-16 uppercase text-gray-400">Website:</span> <span className="text-blue-600 font-bold">thangcomputer.com</span></div>
           </div>
           <div className="space-y-1 text-right">
              <div className="flex justify-end"><span className="font-bold uppercase text-gray-400">Hotline:</span> <span className="text-[#d32f2f] font-black ml-2">093-5758-462 | 0348-051-379</span></div>
              <div className="flex justify-end"><span className="font-bold uppercase text-gray-400">Email:</span> hotro@thangcomputer.com</div>
           </div>
        </div>

        {/* ===== CONTENT SECTION (DOTTED LINES) ===== */}
        <div className="flex-grow space-y-4 px-8 mt-2">
          {/* Người nộp */}
          <div className="flex items-end">
             <span className="font-bold text-gray-500 uppercase text-[9pt] min-w-[140px] mb-0.5">Họ tên người nộp:</span>
             <div className="flex-grow border-b border-dotted border-gray-400 relative">
                <span className="absolute left-4 bottom-[-1px] font-black text-[14pt] text-blue-900 leading-none">
                  {studentName.toUpperCase()}
                </span>
             </div>
          </div>

          {/* Nội dung */}
          <div className="flex items-end">
             <span className="font-bold text-gray-500 uppercase text-[9pt] min-w-[140px] mb-0.5">Nội dung thu:</span>
             <div className="flex-grow border-b border-dotted border-gray-400 relative">
                <span className="absolute left-4 bottom-[-1px] font-bold text-[12.5pt] leading-none">
                  {courseName}
                </span>
             </div>
          </div>

          {/* Tiền + Chữ */}
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-5 flex items-end">
               <span className="font-bold text-gray-500 uppercase text-[9pt] min-w-[80px] mb-0.5">Số tiền:</span>
               <div className="flex-grow border-b border-dotted border-gray-400 relative">
                  <span className="absolute left-4 bottom-[-1px] font-black text-[15pt] text-[#d32f2f] leading-none">
                    {formatCurrency(tuitionFee)} VNĐ
                  </span>
               </div>
            </div>
            <div className="col-span-7 flex items-end">
               <span className="font-bold text-gray-500 uppercase text-[9pt] min-w-[60px] mb-0.5 text-center">Bằng chữ:</span>
               <div className="flex-grow border-b border-dotted border-gray-400 relative">
                  <span className="absolute left-2 bottom-[-1px] italic font-bold text-[10pt] text-[#d32f2f] leading-none whitespace-nowrap">
                    {docSoTien(tuitionFee)}
                  </span>
               </div>
            </div>
          </div>
        </div>

        {/* ===== FOOTER SECTION ===== */}
        <div className="mt-auto flex justify-between items-end pb-2 px-6">
          {/* Left: Stamp & Note */}
          <div className="w-[45%] relative">
             <div className="text-[#d32f2f] font-black italic text-[9.5pt] mb-4">Lưu ý: Không hoàn học phí</div>
             
             {isPaid && (
               <div className="relative h-[25mm] w-[50mm]">
                  <div 
                    className="absolute top-0 left-2 w-[40mm] h-[16mm] border-[1.2mm] border-[#d32f2f] border-double rounded-lg flex flex-col items-center justify-center rotate-[-8deg] opacity-80"
                    style={{ background: 'rgba(211, 47, 47, 0.05)' }}
                  >
                    <span className="font-black text-[#d32f2f] text-[12pt] tracking-[2px]">{invoiceSettings.stamp}</span>
                  </div>
               </div>
             )}
          </div>

          {/* Right: Signature */}
          <div className="w-[45%] text-center">
             <p className="italic text-[9pt] text-gray-600 mb-1">TP. Hồ Chí Minh, ngày {day} tháng {month} năm {year}</p>
             <p className="font-black text-[10pt] uppercase text-gray-800">Người nhận tiền</p>
             <p className="text-[7.5pt] text-gray-400 italic mb-1">(Ký và ghi rõ họ tên)</p>
             
             <div className="h-[20mm] flex items-center justify-center relative">
                {invoiceSettings.signature ? (
                  <img 
                    src={invoiceSettings.signature} 
                    alt="Signature" 
                    className="max-h-[22mm] object-contain relative z-10" 
                    crossOrigin="anonymous" 
                  />
                ) : (
                  <div className="font-['Dancing_Script'] text-[24pt] text-blue-800 opacity-40">
                    {receiverName.split(' ').pop()}
                  </div>
                )}
             </div>

             <p className="font-black text-[10.5pt] text-gray-800 mt-1">{receiverName}</p>
          </div>
        </div>

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-12deg] z-0">
           <div className="text-[70pt] font-black whitespace-nowrap uppercase">THẮNG TIN HỌC</div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceTemplate;
export { docSoTien, formatCurrency };
