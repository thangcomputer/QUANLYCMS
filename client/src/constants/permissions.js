/**
 * permissions.js — Bộ Mã Quyền chuẩn hóa dùng chung Frontend & Backend
 * Tuyệt đối không thay đổi giá trị key sau khi đã lưu vào DB.
 */

export const PERMISSIONS = {
  MANAGE_STUDENTS:    'manage_students',      // Học viên: xem/thêm/sửa/xóa
  MANAGE_SCHEDULE:    'manage_schedule',      // Lịch dạy: quản lý lịch giảng dạy
  MANAGE_FINANCE:     'manage_finance',       // Tài chính: thu chi, thanh toán, báo cáo
  MANAGE_MESSAGES:    'manage_messages',      // ⭐ Hộp thư & Tin nhắn hỗ trợ
  MANAGE_TRAINING:    'manage_training',      // Đào tạo GV: module đào tạo
  MANAGE_STUDENT_TRAINING: 'manage_student_training', // Đào tạo HV: module đào tạo học viên
  MANAGE_CERT_PREP:   'manage_cert_prep',      // Ôn thi MOS/IC3 (CertPrep)
  MANAGE_STAFF:       'manage_staff',         // Phân quyền NV: Super luôn có; HIGH/STAFF khi được cấp
  MANAGE_HR:          'manage_hr',            // ⭐ Nhân sự & Lương: quản lý hồ sơ + trả lương
  MANAGE_BLOG:        'manage_blog',          // Tin tức / Blog trung tâm: đăng bài
  SYSTEM_SETTINGS:    'system_settings',      // Cài đặt hệ thống
  VIEW_LOGS:          'view_logs',            // Nhật ký hệ thống
  VIEW_EVALUATIONS:   'view_evaluations',     // Đánh giá nội bộ
  VIEW_BRANCH_REVENUE:'view_branch_revenue',  // ⭐ Xem báo cáo doanh thu (chỉ chi nhánh)
  VIEW_TEACHERS:      'view_teachers',        // ⭐ Xem danh sách giảng viên (read-only)
  MANAGE_TEACHERS:    'manage_teachers',      // Duyệt / chấm / từ chối giảng viên
  VIEW_CENTER_INFO:   'view_center_info',     // Xem Thông tin trung tâm
  MANAGE_CENTER_INFO: 'manage_center_info',   // Quản trị Thông tin trung tâm (Super)
};

/** Enum các adminRole — dùng chung thay vì hard-code string */
export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HIGH_ADMIN: 'HIGH_ADMIN',
  STAFF: 'STAFF',
  SUPPORT: 'SUPPORT',
};

/** Quyền mặc định khi tạo HIGH_ADMIN — có thể điều chỉnh sau */
export const HIGH_ADMIN_DEFAULT_PERMISSIONS = [
  'manage_students', 'view_teachers', 'manage_teachers', 'manage_schedule',
  'manage_messages', 'manage_finance', 'view_branch_revenue',
  'manage_training', 'manage_student_training',
  'manage_hr', 'manage_blog',
  'view_logs', 'view_evaluations',
];

/** Quyền mặc định cho SUPPORT */
export const SUPPORT_DEFAULT_PERMISSIONS = ['manage_messages'];

/** Danh sách toàn bộ permissions với label tiếng Việt (dùng trong form phân quyền) */
export const ALL_PERMISSIONS = [
  { key: PERMISSIONS.MANAGE_STUDENTS,     label: 'Quản lý Học viên',           desc: 'Xem, thêm, sửa, xóa học viên' },
  { key: PERMISSIONS.VIEW_TEACHERS,       label: '👁️ Xem Giảng viên',         desc: 'Chỉ xem danh sách GV chi nhánh (không thêm/sửa/xóa)' },
  { key: PERMISSIONS.MANAGE_TEACHERS,     label: 'Quản lý Giảng viên',         desc: 'Duyệt, chấm điểm, từ chối hồ sơ giảng viên' },
  { key: PERMISSIONS.MANAGE_SCHEDULE,     label: 'Lịch dạy',                   desc: 'Quản lý lịch giảng dạy' },
  { key: PERMISSIONS.MANAGE_MESSAGES,     label: '💬 Hộp thư & Support',       desc: 'Chat, tư vấn, xem và gửi tin nhắn hỗ trợ học viên / giảng viên' },
  { key: PERMISSIONS.MANAGE_FINANCE,      label: 'Tài chính (toàn quyền)',     desc: 'Thu chi, thanh toán lương, quản lý tài chính' },
  { key: PERMISSIONS.VIEW_BRANCH_REVENUE, label: '📊 Xem Báo cáo doanh thu',  desc: 'Chỉ xem doanh thu chi nhánh (read-only)' },
  { key: PERMISSIONS.MANAGE_TRAINING,     label: 'Đào tạo GV',             desc: 'Module đào tạo giảng viên' },
  { key: PERMISSIONS.MANAGE_STUDENT_TRAINING, label: 'Đào tạo HV',         desc: 'Module đào tạo học viên' },
  { key: PERMISSIONS.MANAGE_CERT_PREP,    label: 'Ôn thi MOS/IC3',         desc: 'Quản lý ngân hàng ôn thi chứng chỉ MOS/IC3' },
  { key: PERMISSIONS.MANAGE_HR,            label: '👤 Nhân sự & Lương',         desc: 'Quản lý hồ sơ nhân viên, trả lương hàng tháng' },
  { key: PERMISSIONS.MANAGE_BLOG,          label: '📰 Tin tức / Blog',           desc: 'Đăng, sửa, ẩn, xóa bài viết tin tức trung tâm' },
  { key: PERMISSIONS.VIEW_CENTER_INFO,    label: 'ℹ️ Xem Thông tin trung tâm', desc: 'Xem trang giới thiệu trung tâm' },
  { key: PERMISSIONS.MANAGE_CENTER_INFO,  label: '✏️ Quản trị Thông tin trung tâm', desc: 'Thêm/sửa/xóa/publish nội dung Thông tin trung tâm' },
  { key: PERMISSIONS.SYSTEM_SETTINGS,     label: 'Cài đặt hệ thống',          desc: 'Cấu hình ngân hàng, chi nhánh, thông báo' },
  { key: PERMISSIONS.VIEW_LOGS,           label: 'Nhật ký hệ thống',          desc: 'Xem log hoạt động hệ thống' },
  { key: PERMISSIONS.VIEW_EVALUATIONS,    label: 'Đánh giá nội bộ',           desc: 'Xem đánh giá và kiểm tra nội bộ' },
  { key: PERMISSIONS.MANAGE_STAFF,        label: 'Quản lý Nhân viên',         desc: 'Mở menu Phân quyền NV — nên cấp thận trọng (HIGH/Super)' },
];

/** Kiểm tra quyền: Super Admin có tất cả quyền */
export function hasPermission(session, permKey) {
  if (!session) return false;
  // 1. Root admin / Super Admin
  if (session.id === 'admin' || session._id === 'admin' || session.username === 'admin') return true;
  if (session.adminRole === 'SUPER_ADMIN') return true;
  if (session.role === 'admin' && (!session.adminRole || session.adminRole === 'SUPER_ADMIN')) return true;

  // 2. HIGH_ADMIN hoặc STAFF có permissions
  const perms = Array.isArray(session.permissions) ? session.permissions : [];
  if (perms.includes(permKey)) return true;

  // 3. Legacy admin không có adminRole vẫn được toàn quyền.
  // HIGH_ADMIN có role vận chuyển là "admin" nhưng phải tuân theo permissions.
  if (session.role === 'admin' && !session.adminRole) return true;

  return false;
}
