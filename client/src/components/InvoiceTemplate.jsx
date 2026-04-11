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

  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [dynamicLogo, setDynamicLogo] = React.useState('');

  React.useEffect(() => {
    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data?.logoUrl) {
          const url = res.data.logoUrl;
          setDynamicLogo(url.startsWith('http') ? url : `${API}${url}`);
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
        overflow: 'hidden',
      }}
    >
      {/* ===== VIỀN ĐỎ BAO QUANH ===== */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: '4px solid #d32f2f',
        }}
      />

      {/* ===== NỘI DUNG CHÍNH ===== */}
      <div className="relative h-full flex flex-col" style={{ padding: '10mm 12mm 8mm 12mm' }}>

        {/* ===== HEADER ===== */}
        <div className="flex items-start justify-between" style={{ marginBottom: '4mm' }}>

          {/* --- Logo bên trái (logo gốc từ thangcomputer.com) --- */}
          <div className="flex items-center">
            <img
              src={dynamicLogo || "/logo-thang-tin-hoc.svg"}
              alt="Thắng Tin Học - Phát Triển Tri Thức Việt"
              style={{ height: '18mm', objectFit: 'contain' }}
              crossOrigin="anonymous"
            />
          </div>

          {/* --- Tên trung tâm bên phải --- */}
          <div
            className="text-right flex-shrink-0"
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              maxWidth: '55%',
            }}
          >
            <div
              className="font-bold italic leading-tight"
              style={{
                fontSize: '17pt',
                color: '#d32f2f',
              }}
            >
              TRUNG TÂM ĐÀO TẠO TIN HỌC
            </div>
            <div
              className="font-bold italic leading-tight"
              style={{
                fontSize: '17pt',
                color: '#d32f2f',
              }}
            >
              THẮNG TIN HỌC
            </div>
          </div>
        </div>

        {/* ===== THÔNG TIN LIÊN HỆ ===== */}
        <div style={{ fontSize: '8.5pt', color: '#333', marginBottom: '4mm', lineHeight: '1.7' }}>
          <div>
            <span className="font-semibold">Hotline liên hệ:</span>{' '}
            <span style={{ color: '#d32f2f', fontWeight: 600 }}>093-5758-462</span>{' '}
            <span>|</span>{' '}
            <span style={{ color: '#d32f2f', fontWeight: 600 }}>0348-051-379</span>
          </div>
          <div>
            <span className="font-semibold">Website:</span>{' '}
            <span style={{ color: '#1565c0' }}>thangcomputer.com</span>
          </div>
          <div>
            <span className="font-semibold">Địa chỉ :</span>{' '}
            13Q Phan Cát Tựu, P. An Lạc, Bình Tân, TP.Hồ Chí Minh
          </div>
        </div>

        {/* ===== TIÊU ĐỀ THU HỌC PHÍ ===== */}
        <div className="text-center" style={{ marginBottom: '5mm' }}>
          <h1
            className="inline-block font-bold"
            style={{
              fontSize: '20pt',
              color: '#d32f2f',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: 'underline',
              textUnderlineOffset: '4px',
              textDecorationThickness: '2px',
              fontStyle: 'italic',
            }}
          >
            THU HỌC PHÍ
          </h1>
        </div>

        {/* ===== WATERMARK THẮNG TIN HỌC ===== */}
        <div
          className="absolute pointer-events-none select-none"
          style={{
            top: '52%',
            left: '58%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.04,
            zIndex: 0,
          }}
        >
          <div
            className="font-bold text-center"
            style={{
              fontSize: '32pt',
              color: '#1565c0',
              letterSpacing: '2px',
            }}
          >
            THẮNG TIN HỌC
          </div>
          <div
            className="text-center font-semibold"
            style={{
              fontSize: '11pt',
              color: '#1565c0',
              letterSpacing: '3px',
            }}
          >
            PHÁT TRIỂN TRI THỨC VIỆT
          </div>
        </div>

        {/* ===== NỘI DUNG HÓA ĐƠN ===== */}
        <div className="relative z-10 flex-grow" style={{ fontSize: '11pt', lineHeight: '2.2' }}>
          <div>
            <span className="font-semibold" style={{ marginRight: '2mm' }}>Tên học viên:</span>
            <span className="font-bold" style={{ color: '#1a1a1a' }}>
              {studentName}
            </span>
          </div>
          <div>
            <span className="font-semibold" style={{ marginRight: '2mm' }}>Nội dung khóa học:</span>
            <span className="font-bold" style={{ color: '#1a1a1a' }}>
              {courseName}
            </span>
          </div>
          <div>
            <span className="font-semibold" style={{ marginRight: '2mm' }}>Học phí :</span>
            <span className="font-bold" style={{ color: '#d32f2f' }}>
              {tuitionFee ? formatCurrency(tuitionFee) + ' VNĐ' : ''}
            </span>
          </div>
          <div>
            <span className="font-semibold" style={{ marginRight: '2mm' }}>Viết bằng chữ :</span>
            <span className="italic" style={{ color: '#d32f2f' }}>
              {tuitionFee ? docSoTien(tuitionFee) : ''}
            </span>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="relative z-10" style={{ marginTop: 'auto' }}>
          {/* Ngày + Người nhận tiền - bên phải */}
          <div className="flex justify-end" style={{ marginBottom: '2mm' }}>
            <div className="text-center" style={{ marginRight: '8mm' }}>
              <div
                className="italic"
                style={{
                  fontSize: '10pt',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  marginBottom: '1mm',
                }}
              >
                Ngày &nbsp;{day}&nbsp; tháng {month} năm {year}
              </div>
              <div
                className="font-semibold"
                style={{ fontSize: '10pt', marginBottom: '3mm' }}
              >
                Người nhận tiền
              </div>
              {/* Chữ ký */}
              <div
                style={{
                  fontFamily: '"Dancing Script", cursive',
                  fontSize: '20pt',
                  color: '#1565c0',
                  marginBottom: '1mm',
                  lineHeight: 1,
                }}
              >
                {receiverName.split(' ').pop()}
              </div>
              <div className="font-bold" style={{ fontSize: '10pt' }}>
                {receiverName}
              </div>
            </div>
          </div>

          {/* Lưu ý + Dấu mộc */}
          <div className="flex justify-between items-end">
            {/* --- Lưu ý bên trái --- */}
            <div
              className="italic font-bold"
              style={{
                fontSize: '9.5pt',
                color: '#d32f2f',
                maxWidth: '50%',
              }}
            >
              Lưu ý: Không hoàn học phí với bất kỳ lý do gì
            </div>

            {/* --- Dấu mộc bên phải --- */}
            {isPaid && (
              <div
                className="flex items-center justify-center"
                style={{
                  width: '35mm',
                  height: '12mm',
                  border: '2.5px solid #d32f2f',
                  borderRadius: '3px',
                  transform: 'rotate(-12deg)',
                  opacity: 0.8,
                  marginRight: '3mm',
                  marginBottom: '-2mm',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  className="font-bold tracking-wider"
                  style={{
                    fontSize: '10pt',
                    color: '#d32f2f',
                    textTransform: 'uppercase',
                  }}
                >
                  ĐÃ THANH TOÁN
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceTemplate;
export { docSoTien, formatCurrency };
