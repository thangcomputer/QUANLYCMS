/**
 * permissions.js — Bộ Mã Quyền chuẩn hóa dùng chung Frontend & Backend
 * Tuyệt đối không thay đổi giá trị key sau khi đã lưu vào DB.
 */

export const PERMISSIONS = {
  MANAGE_STUDENTS:    'manage_students',      // Học viên: xem/thêm/sửa/xóa
  MANAGE_SCHEDULE:    'manage_schedule',      // Lịch dạy: quản lý lịch giảng dạy
  MANAGE_FINANCE:     'manage_finance',       // Tài chính: thu chi, thanh toán, báo cáo
  MANAGE_TRAINING:    'manage_training',      // Đào tạo GV/HV: module đào tạo
  MANAGE_STAFF:       'manage_staff',         // Phân quyền NV: chỉ Super Admin
  MANAGE_HR:          'manage_hr',            // ⭐ Nhân sự & Lương: quản lý hồ sơ + trả lương
  SYSTEM_SETTINGS:    'system_settings',      // Cài đặt hệ thống
  VIEW_LOGS:          'view_logs',            // Nhật ký hệ thống
  VIEW_EVALUATIONS:   'view_evaluations',     // Đánh giá nội bộ
  VIEW_BRANCH_REVENUE:'view_branch_revenue',  // ⭐ Xem báo cáo doanh thu (chỉ chi nhánh)
  VIEW_TEACHERS:      'view_teachers',        // ⭐ Xem danh sách giảng viên (read-only)
};

/** Danh sách toàn bộ permissions với label tiếng Việt (dùng trong form phân quyền) */
export const ALL_PERMISSIONS = [
  { key: PERMISSIONS.MANAGE_STUDENTS,     label: 'Quản lý Học viên',           desc: 'Xem, thêm, sửa, xóa học viên' },
  { key: PERMISSIONS.VIEW_TEACHERS,       label: '👁️ Xem Giảng viên',         desc: 'Chỉ xem danh sách GV chi nhánh (không thêm/sửa/xóa)' },
  { key: PERMISSIONS.MANAGE_SCHEDULE,     label: 'Lịch dạy',                   desc: 'Quản lý lịch giảng dạy' },
  { key: PERMISSIONS.MANAGE_FINANCE,      label: 'Tài chính (toàn quyền)',     desc: 'Thu chi, thanh toán lương, quản lý tài chính' },
  { key: PERMISSIONS.VIEW_BRANCH_REVENUE, label: '📊 Xem Báo cáo doanh thu',  desc: 'Chỉ xem doanh thu chi nhánh (read-only)' },
  { key: PERMISSIONS.MANAGE_TRAINING,     label: 'Đào tạo GV/HV',             desc: 'Module đào tạo giảng viên và học viên' },
  { key: PERMISSIONS.MANAGE_HR,            label: '👤 Nhân sự & Lương',         desc: 'Quản lý hồ sơ nhân viên, trả lương hàng tháng' },
  { key: PERMISSIONS.SYSTEM_SETTINGS,     label: 'Cài đặt hệ thống',          desc: 'Cấu hình ngân hàng, chi nhánh, thông báo' },
  { key: PERMISSIONS.VIEW_LOGS,           label: 'Nhật ký hệ thống',          desc: 'Xem log hoạt động hệ thống' },
  { key: PERMISSIONS.VIEW_EVALUATIONS,    label: 'Đánh giá nội bộ',           desc: 'Xem đánh giá và kiểm tra nội bộ' },
  { key: PERMISSIONS.MANAGE_STAFF,        label: 'Quản lý Nhân viên',         desc: '⚠ Chỉ nên cấp cho Super Admin' },
];

/** Kiểm tra quyền: Super Admin có tất cả quyền */
export function hasPermission(session, permKey) {
  if (!session) return false;
  if (session.id === 'admin') return true;
  if (session.adminRole === 'SUPER_ADMIN') return true;
  const perms = session.permissions || [];
  return perms.includes(permKey);
}
