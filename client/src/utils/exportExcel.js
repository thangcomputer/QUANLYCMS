// ═══════════════════════════════════════════════════════════════════════════════
// Export Excel Utility — Đúng chuẩn Blob Download
// ═══════════════════════════════════════════════════════════════════════════════

import { API_BASE } from '../services/api';

/**
 * Tải file từ backend dưới dạng Blob và kích hoạt download
 * Đảm bảo KHÔNG parse JSON — nhận raw binary data
 *
 * @param {string} endpoint - API path (VD: /invoices/stats/export)
 * @param {string} filename  - Tên file lưu về (VD: 'bao-cao-2024.xlsx')
 * @param {Object} options   - fetch options (method, body,...)
 */
export const downloadFileFromAPI = async (endpoint, filename, options = {}) => {
  const token = localStorage.getItem('admin_access_token');
  const headers = {
    ...(options.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  if (!res.ok) {
    // Thử parse lỗi JSON an toàn
    let errMsg = `Lỗi ${res.status}`;
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        errMsg = json.message || errMsg;
      }
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  // Nhận về Blob — KHÔNG parse JSON
  const blob = await res.blob();

  if (blob.size === 0) throw new Error('File rỗng — backend chưa trả dữ liệu');

  // Tạo URL ảo để trigger download
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Giải phóng bộ nhớ sau 60 giây
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return true;
};

/**
 * Xuất báo cáo học viên ra Excel
 */
export const exportStudentsExcel = async () => {
  return downloadFileFromAPI(
    '/students/export',
    `BaoCaoHocVien_${getTodayStr()}.xlsx`
  );
};

/**
 * Xuất báo cáo hóa đơn ra Excel
 */
export const exportInvoicesExcel = async () => {
  return downloadFileFromAPI(
    '/invoices/export',
    `BaoCaoHoaDon_${getTodayStr()}.xlsx`
  );
};

/**
 * Xuất báo cáo tài chính giảng viên ra Excel
 */
export const exportTransactionsExcel = async () => {
  return downloadFileFromAPI(
    '/transactions/export',
    `BaoCaoLuongGV_${getTodayStr()}.xlsx`
  );
};

/**
 * Tải PDF hóa đơn từ backend (trả về buffer PDF)
 */
export const downloadInvoicePDF = async (invoiceId, invoiceCode = 'HD') => {
  return downloadFileFromAPI(
    `/invoices/${invoiceId}/pdf`,
    `HoaDon_${invoiceCode}.pdf`
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const getTodayStr = () =>
  new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');

/**
 * Tạo file Excel đơn giản từ dữ liệu JSON (phía frontend, không cần backend)
 * Dùng khi không có endpoint export riêng
 */
export const exportToCSV = (data, filename = 'export.csv') => {
  if (!data || !data.length) throw new Error('Không có dữ liệu để xuất');

  const headers = Object.keys(data[0]);
  const csvRows = [
    '\uFEFF' + headers.join(','), // BOM UTF-8 để Excel đọc đúng tiếng Việt
    ...data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        // Escape dấu phẩy và ngoặc kép
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str}"`
          : str;
      }).join(',')
    ),
  ];

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
