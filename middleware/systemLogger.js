/**
 * systemLogger.js — Middleware ghi nhật ký hoạt động hệ thống
 *
 * Ghi lại mọi thao tác POST/PUT/DELETE/PATCH thành công
 * Bao gồm: Ai làm, từ đâu, thiết bị gì, thao tác gì, chi tiết gì
 */
const SystemLog = require('../models/SystemLog');

// ── Parse User-Agent → tên trình duyệt + hệ điều hành ──────────────────────
function parseDevice(ua) {
  if (!ua) return 'Không rõ thiết bị';

  let browser = 'Trình duyệt khác';
  let os = 'Hệ điều hành khác';

  // Browser
  if (ua.includes('Edg/'))          browser = 'Edge ' + (ua.match(/Edg\/([\d.]+)/)?.[1]?.split('.')[0] || '');
  else if (ua.includes('OPR/'))     browser = 'Opera ' + (ua.match(/OPR\/([\d.]+)/)?.[1]?.split('.')[0] || '');
  else if (ua.includes('Chrome/'))  browser = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0] || '');
  else if (ua.includes('Firefox/')) browser = 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0] || '');
  else if (ua.includes('Safari/') && !ua.includes('Chrome'))
    browser = 'Safari ' + (ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0] || '');

  // OS
  if (ua.includes('Windows NT 10'))       os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Mac OS X'))       os = 'macOS';
  else if (ua.includes('Android'))        os = 'Android ' + (ua.match(/Android ([\d.]+)/)?.[1] || '');
  else if (ua.includes('iPhone'))         os = 'iOS (iPhone)';
  else if (ua.includes('iPad'))           os = 'iOS (iPad)';
  else if (ua.includes('Linux'))          os = 'Linux';

  return `${browser} / ${os}`;
}

// ── Xác định mô tả chi tiết hành động từ URL ─────────────────────────────────
function describeAction(method, path, body, responseBody) {
  const p = path.toLowerCase();

  // ── Auth ──
  if (p.includes('/login/public'))   return { action: 'ĐĂNG NHẬP', category: 'auth', desc: 'Đăng nhập cổng Học viên/Giảng viên' };
  if (p.includes('/login/internal')) return { action: 'ĐĂNG NHẬP', category: 'auth', desc: 'Đăng nhập cổng Nội bộ (Admin)' };
  if (p.includes('/login'))          return { action: 'ĐĂNG NHẬP', category: 'auth', desc: 'Đăng nhập hệ thống' };
  if (p.includes('/logout'))         return { action: 'ĐĂNG XUẤT', category: 'auth', desc: 'Đăng xuất khỏi hệ thống' };
  if (p.includes('/change-password'))return { action: 'ĐỔI MẬT KHẨU', category: 'auth', desc: 'Thay đổi mật khẩu' };

  // ── Students ──
  if (p.includes('/students') && method === 'POST') {
    const sName = body?.name || '';
    const amount = body?.price ? Number(body.price).toLocaleString('vi-VN') + 'đ' : '';
    const bInfo = (body?.branchCode && body.branchCode !== '') ? body.branchCode : (body?.branchId || '');
    return { action: 'THÊM HỌC VIÊN', category: 'student', desc: `Thêm học viên: ${sName}${amount ? ` - Học phí: ${amount}` : ''}${bInfo ? ` [Chi nhánh: ${bInfo}]` : ''}` };
  }
  if (p.includes('/students') && p.includes('/price')) return { action: 'SỬA HỌC PHÍ', category: 'student', desc: `Điều chỉnh học phí học viên` };
  if (p.includes('/students') && method === 'PUT') {
    const sName = responseBody?.data?.name || body?.name || '';
    return { action: 'CẬP NHẬT HV', category: 'student', desc: `Cập nhật thông tin học viên${sName ? ': ' + sName : ''}` };
  }
  if (p.includes('/students') && method === 'DELETE')  return { action: 'XÓA HỌC VIÊN', category: 'student', desc: `Xóa học viên khỏi hệ thống` };

  // ── Teachers ──
  if (p.includes('/teachers') && method === 'POST') {
    const tName = body?.name || '';
    const bCode = body?.branchCode || '';
    return { action: 'THÊM GIẢNG VIÊN', category: 'teacher', desc: `Thêm giảng viên mới: ${tName}${bCode ? ` [Chi nhánh: ${bCode}]` : ''}` };
  }
  if (p.includes('/teachers') && p.includes('/approve'))  return { action: 'DUYỆT GV', category: 'teacher', desc: `Duyệt cấp quyền giảng viên` };
  if (p.includes('/teachers') && p.includes('/reject'))   return { action: 'TỪ CHỐI GV', category: 'teacher', desc: `Từ chối giảng viên` };
  if (p.includes('/teachers') && p.includes('/score'))    return { action: 'CHẤM ĐIỂM GV', category: 'teacher', desc: `Chấm điểm bài test giảng viên` };
  if (p.includes('/teachers') && p.includes('/finance/pay-flexible')) return { action: 'THANH TOÁN GV', category: 'finance', desc: `Thanh toán lương giảng viên: ${body?.amount ? body.amount + 'đ' : ''}` };
  if (p.includes('/teachers') && p.includes('/finance/pay-all')) return { action: 'THANH TOÁN TẤT CẢ', category: 'finance', desc: `Thanh toán toàn bộ lương giảng viên` };
  if (p.includes('/teachers') && method === 'PUT') {
    const tName = responseBody?.data?.name || body?.name || '';
    return { action: 'CẬP NHẬT GV', category: 'teacher', desc: `Cập nhật thông tin giảng viên${tName ? ': ' + tName : ''}` };
  }
  if (p.includes('/teachers') && method === 'DELETE')  return { action: 'XÓA GIẢNG VIÊN', category: 'teacher', desc: `Xóa giảng viên khỏi hệ thống` };

  // ── Schedule ──
  if (p.includes('/schedules') && method === 'POST')   return { action: 'TẠO LỊCH HỌC', category: 'schedule', desc: `Tạo lịch học mới` };
  if (p.includes('/schedules') && method === 'PUT')    return { action: 'CẬP NHẬT LỊCH', category: 'schedule', desc: `Cập nhật/hoàn thành buổi học` };
  if (p.includes('/schedules') && method === 'DELETE')  return { action: 'XÓA LỊCH', category: 'schedule', desc: `Xóa lịch học` };

  // ── Finance ──
  if (p.includes('/transactions') && p.includes('/confirm'))  return { action: 'XÁC NHẬN LƯƠNG', category: 'finance', desc: `Xác nhận thanh toán lương giảng viên` };
  if (p.includes('/transactions') && p.includes('/cancel'))   return { action: 'HỦY GIAO DỊCH', category: 'finance', desc: `Hủy giao dịch` };
  if (p.includes('/transactions') && method === 'POST')       return { action: 'TẠO GIAO DỊCH', category: 'finance', desc: `Tạo phiếu thanh toán lương` };
  if (p.includes('/invoices'))       return { action: method === 'POST' ? 'TẠO HÓA ĐƠN' : 'CẬP NHẬT HÓA ĐƠN', category: 'finance', desc: `Xử lý hóa đơn` };

  // ── Staff ──
  if (p.includes('/staff') && method === 'POST')   return { action: 'THÊM NHÂN VIÊN', category: 'staff', desc: `Thêm nhân viên mới: ${body?.name || ''}` };
  if (p.includes('/staff') && method === 'PUT')    return { action: 'PHÂN QUYỀN', category: 'staff', desc: `Cập nhật quyền nhân viên` };
  if (p.includes('/staff') && method === 'DELETE')  return { action: 'XÓA NHÂN VIÊN', category: 'staff', desc: `Xóa nhân viên khỏi hệ thống` };

  // ── Settings ──
  if (p.includes('/settings'))  return { action: 'CÀI ĐẶT', category: 'settings', desc: `Cập nhật cài đặt hệ thống` };
  if (p.includes('/branches'))  return { action: method === 'POST' ? 'THÊM CHI NHÁNH' : 'CẬP NHẬT CHI NHÁNH', category: 'settings', desc: `Quản lý chi nhánh` };
  if (p.includes('/courses'))   return { action: method === 'POST' ? 'THÊM KHÓA HỌC' : 'CẬP NHẬT KHÓA HỌC', category: 'settings', desc: `Quản lý khóa học` };

  // ── Webhook ──
  if (p.includes('/webhooks/sepay'))  return { action: 'THANH TOÁN', category: 'finance', desc: `Webhook SePay: nhận thanh toán tự động` };
  if (p.includes('/webhooks/create-session') || p.includes('/webhooks/payment-session')) {
    if (method === 'POST') {
      const sName = body?.studentName || '';
      const amount = body?.amount ? Number(body.amount).toLocaleString('vi-VN') + 'đ' : '';
      const bCode = (body?.branchCode && body.branchCode !== '') ? body.branchCode : '';
      return { action: 'TẠO MÃ QR', category: 'finance', desc: `Tạo QR thanh toán cho ${sName || 'Học viên'} - ${amount}${bCode ? ` [Chi nhánh: ${bCode}]` : ''}` };
    }
  }

  // ── Assignments ──
  if (p.includes('/assignments/upload')) return {}; // Bỏ qua log file bẩn (trả về empty obj để !action bắt được ở dưới nếu có logic chặn)
  if (p.includes('/assignments/submit') && method === 'POST') return { action: 'NỘP BÀI TẬP', category: 'assignment', desc: `Học viên nộp bài` };
  if (p.includes('/assignments/grade') && method === 'POST') return { action: 'CHẤM ĐIỂM BÀI TẬP', category: 'assignment', desc: `Giảng viên chấm bài` };
  if (p.includes('/assignments') && method === 'POST') return { action: 'TẠO BÀI TẬP', category: 'assignment', desc: `Tạo bài tập/tài liệu mới` };
  if (p.includes('/assignments') && method === 'DELETE') return { action: 'XÓA BÀI TẬP', category: 'assignment', desc: `Xóa bài tập hệ thống` };

  // ── Evaluation ──
  if (p.includes('/evaluations') && p.includes('/read')) return { action: 'ĐỌC PHẢN HỒI', category: 'evaluation', desc: `Đánh dấu đã đọc đánh giá/phản hồi` };
  if (p.includes('/evaluations') && method === 'POST')  return { action: 'ĐÁNH GIÁ', category: 'evaluation', desc: `Gửi/cập nhật đánh giá` };

  // ── Employees (HR & Payroll) ──
  if (p.includes('/employees') && p.includes('/pay') && method === 'POST') {
    const empName = responseBody?.data?.employeeName || body?.employeeName || '';
    const amount  = responseBody?.data?.amount || body?.amount || 0;
    const amtStr  = Number(amount).toLocaleString('vi-VN');
    return { action: 'THANH TOÁN LƯƠNG', category: 'hr', desc: `Thanh toán lương nhân viên ${empName}: ${amtStr}đ${body?.monthLabel ? ` (${body.monthLabel})` : ''}` };
  }
  if (p.includes('/employees') && method === 'POST')   return { action: 'THÊM NHÂN SỰ', category: 'hr', desc: `Thêm nhân viên mới: ${body?.name || ''}${body?.position ? ` (${body.position})` : ''}` };
  if (p.includes('/employees') && method === 'PUT')    return { action: 'CẬP NHẬT NHÂN SỰ', category: 'hr', desc: `Cập nhật hồ sơ nhân viên${body?.name ? ': ' + body.name : ''}` };
  if (p.includes('/employees') && method === 'DELETE') {
    const deletedName = responseBody?.message || '';
    return { action: 'XÓA NHÂN SỰ', category: 'hr', desc: deletedName || `Xóa nhân viên khỏi hệ thống` };
  }

  // ── Fallback ──
  if (method === 'POST')   return { action: 'THÊM MỚI', category: 'system', desc: `Thêm dữ liệu tại ${path}` };
  if (method === 'PUT' || method === 'PATCH') return { action: 'CẬP NHẬT', category: 'system', desc: `Cập nhật dữ liệu tại ${path}` };
  if (method === 'DELETE') return { action: 'XÓA', category: 'system', desc: `Xóa dữ liệu tại ${path}` };
  return { action: method, category: 'system', desc: `Thao tác ${method} tại ${path}` };
}

// ── Chính: Middleware ghi log ────────────────────────────────────────────────
const systemLogger = (req, res, next) => {
  const originalJson = res.json;

  res.json = function (body) {
    // Chỉ ghi log thao tác ghi thành công (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const path = req.originalUrl;
        // ⭐ Bỏ qua log các hành động lặp lại/không quan trọng để đỡ rối nhật ký
        if (path.includes('/notifications/mark-read')) return originalJson.call(this, body);

        const { action, category, desc } = describeAction(req.method, path, req.body, body);
        if (!action) return originalJson.call(this, body);

        const ua = req.headers['user-agent'] || '';
        const device = parseDevice(ua);

        // Xác định user info
        let user_id = req.user ? (req.user.id || req.user._id) : (req.body?.phone || 'Guest');
        let name    = req.user ? req.user.name : 'Không rõ';
        let role    = req.user ? req.user.role : 'guest';
        let adminRole  = req.user?.adminRole || null;
        let branchCode = req.user?.branchCode || req.userBranchCode || '';

        // Đăng nhập thành công → lấy info từ response
        if (action === 'ĐĂNG NHẬP' && body.success && body.data) {
          const u = body.data.user || body.data;
          user_id    = u._id || u.id || user_id;
          name       = u.name || 'Admin';
          role       = u.role || 'admin';
          adminRole  = u.adminRole || null;
          branchCode = u.branchCode || '';
        }

        // Xây message chi tiết
        const roleName = role === 'admin' ? (adminRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Nhân viên') : role === 'teacher' ? 'Giảng viên' : role === 'student' ? 'Học viên' : role;
        const branchInfo = branchCode ? ` [Chi nhánh ${branchCode}]` : '';
        const message = `${desc}`;

        // IP: lấy real IP qua proxy
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.headers['x-real-ip']
                || req.socket?.remoteAddress
                || req.ip
                || 'unknown';

        // Ghi log async (không block response)
        SystemLog.create({
          user_id: String(user_id),
          name: String(name),
          role: String(role),
          adminRole,
          branchCode,
          action,
          category,
          target: req.originalUrl,
          method: req.method,
          message,
          ip,
          device,
          userAgent: ua.substring(0, 500),
        }).catch(err => console.error('[Logger] Failed to write SystemLog:', err));
      }
    }

    return originalJson.call(this, body);
  };

  next();
};

module.exports = systemLogger;
