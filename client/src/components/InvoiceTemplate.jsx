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
      className="relative bg-white"
      style={{
        width: '210mm',
        height: '148mm',
        fontFamily: "'Inter', sans-serif",
        color: '#1a1a1a',
        padding: '10mm',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* ===== VIỀN ĐỨT ĐOẠN ĐỎ ===== */}
      <div className="absolute inset-[2mm] border-[1.5mm] border-dashed border-[#d32f2f] pointer-events-none opacity-80" />

      <div className="relative h-full flex flex-col p-2">
        
        {/* ===== HEADER SECTION ===== */}
        <div className="flex justify-between items-start mb-6">
          <div className="w-[50%]">
            <img
              src={invoiceSettings.logo || "/logo-thang-tin-hoc.svg"}
              alt="Logo"
              style={{ height: '22mm', maxWidth: '100%', objectFit: 'contain', marginBottom: '4mm' }}
              crossOrigin="anonymous"
            />
            <div className="text-[9.5pt] space-y-1 font-medium text-gray-700">
               <p>Hotline liên hệ: 093-5758-462 | 0348-051-379</p>
               <p>Website: thangcomputer.com</p>
               <p>Địa chỉ : 13Q Phan Cát Tựu, P. An Lạc, TP.Hồ Chí Minh</p>
            </div>
          </div>

          <div className="w-[50%] text-center">
            <h1 className="font-black leading-tight text-[#d32f2f]" style={{ fontSize: '24pt', marginTop: '4mm' }}>
              TRUNG TÂM ĐÀO TẠO TIN HỌC<br />THẮNG TIN HỌC
            </h1>
          </div>
        </div>

        {/* ===== TIÊU ĐỀ ===== */}
        <div className="text-center mb-8">
           <h2 className="text-[#d32f2f] font-bold underline inline-block" style={{ fontSize: '22pt' }}>
             THU HỌC PHÍ
           </h2>
        </div>

        {/* ===== NỘI DUNG FIELDS ===== */}
        <div className="flex-grow space-y-4 px-10 relative">
           {/* Watermark chìm */}
           <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
              <img src={invoiceSettings.logo || "/logo-thang-tin-hoc.svg"} className="w-80 h-auto grayscale" alt="watermark" />
           </div>

           <div className="relative z-10 space-y-3" style={{ fontSize: '14pt' }}>
              <div className="flex items-center gap-2">
                 <span className="text-gray-700">Tên học viên:</span>
                 <span className="font-bold text-[#1e1e2e] uppercase">{studentName}</span>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-gray-700">Nội dung khóa học:</span>
                 <span className="font-bold text-[#1e1e2e] uppercase">{courseName}</span>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-gray-700">Học phí :</span>
                 <span className="font-bold text-[#1e1e2e]">{formatCurrency(tuitionFee)} VNĐ</span>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-gray-700">Viết bằng chữ :</span>
                 <span className="italic text-[#2a2a4a]">{docSoTien(tuitionFee)}</span>
              </div>
           </div>
        </div>

        {/* ===== FOOTER SECTION ===== */}
        <div className="mt-auto relative z-10">
           <div className="flex justify-between items-end px-4 pb-4">
              {/* Note bên trái */}
              <div className="text-[#d32f2f] font-bold italic text-[13pt] mb-10">
                 Lưu ý: Không hoàn học phí với bất kỳ lý do gì
              </div>

              {/* Chữ ký & Stamp bên phải */}
              <div className="text-right min-w-[70mm]">
                 <p className="font-bold italic text-[12pt] mb-2">Ngày {day} tháng {month} năm {year}</p>
                 <p className="font-bold text-[12pt] mr-12 mb-2">Người nhận tiền</p>
                 
                 <div className="h-[20mm] flex items-center justify-center mr-10 relative">
                    {invoiceSettings.signature ? (
                      <img src={invoiceSettings.signature} className="max-h-[20mm] object-contain" alt="sig" crossOrigin="anonymous" />
                    ) : (
                      <div className="font-['Dancing_Script'] text-[32pt] opacity-30">{receiverName.split(' ').pop()}</div>
                    )}
                 </div>

                 <p className="font-bold text-[13pt] mr-12">{receiverName}</p>

                 {/* Stamp tilted */}
                 {isPaid && (
                   <div 
                    className="absolute bottom-[-2mm] right-[-2mm] border-[1mm] border-[#d32f2f] px-4 py-2 rotate-[-15deg] font-black text-[#d32f2f] text-[16pt] opacity-80"
                    style={{ background: 'white' }}
                   >
                     {invoiceSettings.stamp}
                   </div>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceTemplate;
export { docSoTien, formatCurrency };
