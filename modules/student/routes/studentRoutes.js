const express = require('express');
const router = express.Router();
const studentController = require('../controllers/StudentController');
const enrollmentController = require('../../enrollment/controllers/EnrollmentController');
const { studentRepository } = require('../repositories');
const Invoice = require('../../invoice/models/Invoice');
const Schedule = require('../../attendance/models/Schedule');
const { authMiddleware, branchFilter, userHasPermission } = require('../../../shared/middleware/authMiddleware');
const { authorize, authorizeAny, authorizeAll } = require('../../../shared/middleware/authorize');
const legacyMapping = require('../../../shared/constants/legacyPermissionMapping');
const NEW_PERMISSIONS = require('../../../shared/constants/permissions');
const { PERMISSIONS } = require('../../../constants/permissions');
const { assertStudentBranchAccess } = require('../../../middleware/studentBranchGuard');
const { sanitizeRegex } = require('../../../middleware/sanitizeRegex');
const logger = require('../../../config/logger');
const {
  applyEnrollmentStats,
  legacyEnrollmentFromStudent,
  studentMatchesTeacher,
  resolveEnrollmentExamSubjects,
} = require('../../enrollment/services/enrollmentService');
const { sendAccountWelcome } = require('../../../services/accountWelcome');
const { generateTempPassword } = require('../../../utils/tempPassword');
const { settlePayment, postRefund, voidLedgerEntry, postSalary } = require('../../finance/services/ledgerService');
const cache = require('../../../utils/cache');

function financeActor(req) {
  return {
    id: String(req.currentUser?.id || req.currentUser?._id || ''),
    role: String(req.currentUser?.role || ''),
  };
}

function financeReqMeta(req, student) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.ip
      || '',
    userAgent: req.headers['user-agent'] || '',
    branchId: student?.branchId || req.currentUser?.branchId || null,
  };
}

function bustFinanceCaches() {
  try {
    cache.delByPrefix('bi:overview');
  } catch { /* ignore */ }
}

async function nextInvoiceCode() {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `HD${yy}${mm}-`;
  // Lấy mã lớn nhất cùng tháng để tăng tuần tự (tránh trùng khi race nhẹ)
  const latest = await Invoice.findOne({ maHoaDon: { $regex: `^${prefix}` } })
    .sort({ maHoaDon: -1 })
    .select('maHoaDon')
    .lean();
  let seq = 1;
  if (latest?.maHoaDon) {
    const m = String(latest.maHoaDon).match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function createTuitionInvoice({ student, courseName, amount, note = '' }) {
  const hocPhi = Number(amount) || 0;
  if (!student?._id || hocPhi <= 0) return null;
  try {
    let maHD = await nextInvoiceCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await Invoice.create({
          maHoaDon: maHD,
          hocVien: student._id,
          hoTen: student.name,
          khoaHoc: courseName || student.course || 'Học phí',
          hocPhi,
          ghiChu: note || `Thanh toán khóa ${courseName || student.course || ''}`.trim(),
        });
      } catch (err) {
        if (err?.code === 11000) {
          maHD = await nextInvoiceCode();
          continue;
        }
        throw err;
      }
    }
    return null;
  } catch (err) {
    logger.warn('[INVOICE] create skipped:', err.message);
    return null;
  }
}

// ─── GET /api/students ─────────────────────────────────────────────────────────
// Lấy danh sách học viên (Admin / Teacher) — hỗ trợ Server-side Pagination
router.get('/', [authMiddleware, branchFilter],studentController.get_root);

// ─── GET /api/students/stats ───────────────────────────────────────────────────
// Thống kê tổng quan (Admin dashboard)
// ─── GET /api/students/stats (branch-aware, timezone-safe) ────────────────────
router.get('/stats', [authMiddleware, branchFilter],studentController.get_stats);

// ─── GET /api/students/:id ─────────────────────────────────────────────────────────────────
router.get('/:id', [authMiddleware, branchFilter],studentController.get_id);

// ─── GET /api/students/:id/full-detail (MEGA ENDPOINT) ───────────────────────
// Tổng hợp toàn bộ hồ sơ học viên: Thông tin cá nhân, Lịch sử điểm danh, Hóa đơn, Điểm thi
router.get('/:id/full-detail', [authMiddleware, branchFilter],studentController.get_id_full_detail); Ledger refund (không tạo Invoice gốc) — append để UI "Tài chính" hiển thị.
    const LedgerEntry = require('../../finance/models/LedgerEntry');
    const refundEntries = await LedgerEntry.find({
      studentId: studentOid,
      type: 'refund',
      status: 'posted',
    }).sort({ postedAt: -1 }).lean();

    const refundInvoices = (refundEntries || []).map((e, idx) => ({
      _id: e._id,
      maHoaDon: `R-${String(e._id || idx).slice(-6)}`,
      createdAt: e.postedAt || e.updatedAt || new Date(),
      ngayXuat: e.postedAt || e.updatedAt || new Date(),
      khoaHoc: e.courseName || 'Khóa học',
      ghiChu: e.note || 'Hoàn tiền (refund)',
      hocPhi: Number(e.amount) || 0,
      synthetic: true,
    }));

    // 3. Kết quả thi (nếu có)
    const ExamResult = require('../../exam/models/ExamResult');
    const examResults = await ExamResult.find({
      $or: [
        { studentId: req.params.id },
        { sbd: student.sbd }
      ]
    }).sort({ createdAt: -1 });

    const studentDoc = student.toObject();
    studentDoc.requireWebcam = studentDoc.requireWebcam === true;
    await applyEnrollmentStats(studentDoc, req.params.id, Schedule);

    res.json({
      success: true,
      data: {
        student: studentDoc,
        schedules: schedules || [],
        invoices: [...(invoices || []), ...(refundInvoices || [])],
        examResults: examResults || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/students/import (BẢN GHI HÀNG LOẠT) ──────────────────────────
// Nhập danh sách học viên từ file Excel (Array of Objects)
router.post('/import', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter],studentController.post_import);

// ─── POST /api/students ────────────────────────────────────────────────────────
// Admin thêm học viên mới
// ─── POST /api/students ──────────────────────────────────────────────────────────────────
router.post('/', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter],studentController.post_root);

// ─── PUT /api/students/:id ─────────────────────────────────────────────────────
// Cập nhật thông tin học viên (Admin, Teacher, Student tự cập nhật)
router.put('/:id', [authMiddleware, branchFilter, assertStudentBranchAccess],studentController.put_id);

// ─── PUT /api/students/:id/exam-progress ───────────────────────────────────────
// Học viên cập nhật tiến độ thi 1 môn (server merge + validate)
router.put('/:id/exam-progress', [authMiddleware, branchFilter, assertStudentBranchAccess],studentController.put_id_exam_progress);

// ─── PATCH /api/students/:id/price ────────────────────────────────────────────
// Admin điều chỉnh học phí riêng cho 1 học viên cụ thể (ghi đè price snapshot)
// Dùng khi: học viên xin giảm học phí, có mã giảm giá, hoặc Admin muốn áp giá mới
router.patch('/:id/price', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_FINANCE)), branchFilter, assertStudentBranchAccess],studentController.patch_id_price);



// ─── PUT /api/students/:id/pay ─────────────────────────────────────────────────
// Workflow 4: Admin xác nhận thu học phí → tạo hóa đơn tự động + ledger payment
router.put('/:id/pay', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_FINANCE)), branchFilter, assertStudentBranchAccess],studentController.put_id_pay);

// ─── PUT /api/students/:id/refund ─────────────────────────────────────────────
// Hoàn tiền: partial (amount) hoặc full. Không xóa Invoice; ghi LedgerEntry refund.
router.put('/:id/refund', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_FINANCE)), branchFilter, assertStudentBranchAccess],studentController.put_id_refund);

// ─── PUT /api/students/:id/unlock-exam ────────────────────────────────────────
// Workflow 2: Admin mở khóa phòng thi thủ công
// Body optional: { enrollmentId } — chỉ mở 1 khóa; không có = mở tất cả enrollment
router.put('/:id/unlock-exam', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter, assertStudentBranchAccess],studentController.put_id_unlock_exam);

// ─── PUT /api/students/:id/lock-exam ──────────────────────────────────────────
// Admin/Staff hoặc GV phụ trách: đánh trượt / khóa phòng thi
router.put('/:id/lock-exam', [authMiddleware, branchFilter, assertStudentBranchAccess],studentController.put_id_lock_exam);

// ─── POST /api/students/:id/enrollments ───────────────────────────────────────
// Admin thêm khóa học mới cho học viên (cùng tài khoản, khác môn / thầy)
router.post('/:id/enrollments', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter, assertStudentBranchAccess],enrollmentController.post_id_enrollments);

function syncStudentFromPrimaryEnrollment(student) {
  if (!student?.enrollments?.length) return;
  const list = student.enrollments;
  const active = list.filter((e) => e?.status !== 'cancelled' && e?.status !== 'refunded');
  if (!active.length) {
    student.course = '(Đã hủy)'; // Tránh lỗi Mongoose validation 'course is required'
    student.price = 0;
    student.paid = false;
    student.paidAt = undefined;
    student.teacherId = null;
    student.teacherName = '';
    student.completedSessions = 0;
    student.remainingSessions = 0;
    student.totalSessions = 12;
    return;
  }
  const primary = active.find((e) => e.isPrimary) || active[0];
  if (!primary) return;
  student.course = primary.courseName;
  student.price = Number(primary.price) || 0;
  student.paid = !!primary.paid;
  student.teacherId = primary.teacherId || null;
  student.teacherName = primary.teacherName || '';
  if (primary.paidAt) student.paidAt = primary.paidAt;
  student.totalSessions = primary.totalSessions || 12;
  student.remainingSessions = primary.remainingSessions ?? primary.totalSessions ?? 12;
  student.completedSessions = primary.completedSessions || 0;
}


// ─── PUT /api/students/:id/enrollments/:enrollmentId/settings ─────────────────
// Cập nhật quyền theo khóa: requireWebcam, examUnlocked
router.put('/:id/enrollments/:enrollmentId/settings', authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)),enrollmentController.put_id_enrollments_enrollmentId_settings);

// ─── PUT /api/students/:id/enrollments/:enrollmentId/pay ──────────────────────
// Xác nhận thanh toán học phí cho 1 khóa (enrollment)
router.put('/:id/enrollments/:enrollmentId/pay', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_FINANCE)), branchFilter, assertStudentBranchAccess],enrollmentController.put_id_enrollments_enrollmentId_pay);

// ─── DELETE /api/students/:id/enrollments/:enrollmentId ───────────────────────
// Hủy (soft-cancel) 1 khóa học — không xóa cứng; hoàn tiền chỉ khi có quyền finance + refundAmount > 0
// Body (optional): { cancelReason: string, refundAmount: number }
router.delete('/:id/enrollments/:enrollmentId', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter, assertStudentBranchAccess],enrollmentController.delete_id_enrollments_enrollmentId);

// ─── PUT /api/students/:id/assign-teacher ─────────────────────────────────────
// Admin/Staff gán (hoặc bỏ gán) giảng viên — theo khóa (enrollmentId) hoặc khóa chính
router.put('/:id/assign-teacher', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter, assertStudentBranchAccess],studentController.put_id_assign_teacher);


// ─── DELETE /api/students/:id ──────────────────────────────────────────────────
router.delete('/:id', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)), branchFilter, assertStudentBranchAccess],studentController.delete_id);

// ─── POST /api/students/:id/reset-today-attendance ─────────────────────────────
// Xóa điểm danh HÔM NAY của học viên — CHỈ CHO PHÉP TRONG VÒNG 1 TIẾNG
router.post('/:id/reset-today-attendance', authMiddleware,studentController.post_id_reset_today_attendance);

// ─── POST /api/students/:id/reset-history ──────────────────────────────────────
// Reset lịch sử học (xóa buổi học, điểm danh, điểm số) — giữ thông tin cá nhân & học phí
router.post('/:id/reset-history', authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_STUDENTS)),studentController.post_id_reset_history);

// ─── PUT /api/students/:id/pay-teacher (THANH TOÁN LƯƠNG TRÊN TỪNG HỌC VIÊN) ───
router.put('/:id/pay-teacher', [authMiddleware, authorizeAny(...legacyMapping.resolve(PERMISSIONS.MANAGE_FINANCE)), branchFilter, assertStudentBranchAccess],studentController.put_id_pay_teacher);

module.exports = router;
