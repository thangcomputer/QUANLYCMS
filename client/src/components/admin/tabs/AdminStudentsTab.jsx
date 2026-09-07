import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CmsSelect from '../../ui/CmsSelect';
import { useAdminTab } from '../AdminTabContext';
import BranchFilterDropdown from '../../BranchFilterDropdown';
import {
  BookOpen, Search, Download, FileSpreadsheet, Plus, Users, AlertTriangle,
  MoreHorizontal, ClipboardList, Unlock, Lock, Camera, Printer, Trash2,
  ChevronLeft, ChevronRight, Loader2, MapPin, Globe, Building2, KeyRound,
  CircleDollarSign, Laptop,
} from 'lucide-react';
import Avatar from '../shared/Avatar';
import { getActiveClientEnrollments, getClientEnrollments } from '../../../utils/enrollments';
import {
  resolveLearningModeLabel,
  resolveBranchDisplayName,
} from '../../../utils/learningModeBranchDisplay';
import { isTeacherActive } from '../../../constants/teacherStatus';
import { teacherMatchesCourse } from '../../../utils/examSubjects';
import { teacherInStudentBranch, toBranchId } from '../../../utils/branchIds';
import { matchesPersonSearch } from '../../../utils/personSearch';
import api, { apiFetch } from '../../../services/api';

/** Tổng tiền đã hoàn từ khóa cancelled (chỉ hiển thị, không sửa). */
function getStudentRefundedTotal(student) {
  return getClientEnrollments(student)
    .filter((e) => e?.status === 'cancelled' || e?.status === 'refunded')
    .reduce((sum, e) => sum + Math.abs(Number(e.refundedAmount) || 0), 0);
}

/** Không còn khóa active — chỉ còn khóa đã hủy/hoàn → dòng mờ + khóa thao tác. */
function isStudentRowLocked(student) {
  const active = getActiveClientEnrollments(student);
  if (active.length > 0) return false;
  const all = getClientEnrollments(student);
  return all.some((e) => e?.status === 'cancelled' || e?.status === 'refunded');
}

function isEnrollmentPaidFlag(e) {
  return e?.paid === true || e?.paid === 'Đã đóng phí' || e?.paid === 'true' || e?.paid === 1;
}

/** Khóa active đã đóng phí — ưu tiên primary. */
function getRefundableEnrollment(student) {
  const paid = getActiveClientEnrollments(student).filter(isEnrollmentPaidFlag);
  if (!paid.length) return null;
  return paid.find((e) => e.isPrimary) || paid[0];
}

function RefundHint({ amount }) {
  const amt = Math.abs(Number(amount) || 0);
  if (!(amt > 0)) return null;
  return (
    <p
      className="text-xs text-slate-400/90 mt-0.5 tabular-nums pointer-events-none select-none"
      title="Hoàn học phí — chỉ xem, không chỉnh sửa"
      aria-readonly="true"
    >
      −{amt.toLocaleString('vi-VN')}đ · hoàn
    </p>
  );
}

function DeviceAccountBadges({ student }) {
  const locked = !!student?.accountLocked;
  const count = Number(student?.knownDeviceCount) || 0;
  if (!locked && count <= 2) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 mt-1">
      {locked && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-100">
          Khóa đăng nhập
        </span>
      )}
      {!locked && count > 2 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-100">
          {count} trình duyệt
        </span>
      )}
    </span>
  );
}

async function confirmAdminAction({ title, content, confirmText, confirmButtonClass }) {
  if (typeof window.cmsConfirmAdvanced === 'function') {
    return window.cmsConfirmAdvanced({
      title,
      content,
      confirmText,
      confirmButtonClass,
      type: 'warning',
    });
  }
  return window.confirm(content);
}

/** Nút ⋯ + menu portal (fixed) — tránh bị che bởi overflow bảng/card. */
function StudentRowActions({
    submittingAction,
    setSubmittingAction,
  s,
  actionMenuId,
  setActionMenuId,
  setShowStudentDetailId,
  setEnrollmentModalStudent,
  approveStudentExam,
  revokeStudentExam,
  ctxUpdateStudent,
  toast,
  handlePrintInvoice,
  removeStudent,
  onOpenRefund,
  align = 'right',
  buttonClassName = 'w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all',
}) {
  const open = actionMenuId === s.id;
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const refundable = getRefundableEnrollment(s);
  const locked = isStudentRowLocked(s);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setCoords((prev) => (prev == null ? prev : null));
      return undefined;
    }
    const place = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      // Card mobile + bảng desktop cùng mount; bản ẩn (display:none) có rect 0 → bỏ qua
      // để tránh portal menu thứ 2 góc trái màn hình.
      if (r.width < 1 || r.height < 1) {
        setCoords((prev) => (prev == null ? prev : null));
        return;
      }
      const menuW = Math.min(260, window.innerWidth - 16);
      const approxH = menuRef.current?.offsetHeight || 450;
      const gap = 6;
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const openUp = spaceBelow < Math.min(approxH, 280) && spaceAbove > spaceBelow;
      let left = align === 'left' ? r.left : r.right - menuW;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      const maxH = Math.max(160, openUp ? spaceAbove : spaceBelow);
      const top = openUp
        ? Math.max(8, r.top - gap - Math.min(approxH, maxH))
        : r.bottom + gap;
      const next = {
        left: Math.round(left),
        top: Math.round(top),
        width: menuW,
        maxH: Math.round(maxH),
        openUp,
      };
      setCoords((prev) => {
        if (
          prev
          && prev.left === next.left
          && prev.top === next.top
          && prev.width === next.width
          && prev.maxH === next.maxH
          && prev.openUp === next.openUp
        ) {
          return prev;
        }
        return next;
      });
    };
    place();
    // Đo lại 1 lần sau khi menu mount (chiều cao thật) — không put object vào deps
    const t = window.setTimeout(place, 0);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  const itemCls =
    'w-full flex items-center gap-2.5 px-3 py-2 min-h-10 text-[13px] font-semibold text-left whitespace-nowrap transition-colors';

  const menu = open && coords
    ? createPortal(
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[10060] bg-white border border-slate-200 rounded-2xl shadow-[0_16px_48px_rgba(15,23,42,0.18)] py-1 w-[min(92vw,260px)] animate-in fade-in zoom-in-95 duration-150 overflow-y-auto overscroll-contain"
        style={{
          left: coords.left,
          top: coords.top,
          width: coords.width,
          maxHeight: coords.maxH,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={() => { setShowStudentDetailId(s.id); setActionMenuId(null); }}
          className={`${itemCls} text-slate-800 hover:bg-slate-50 border-b border-slate-100 mb-0.5`}>
          <ClipboardList size={15} className="shrink-0 text-slate-500" />
          <span className="min-w-0">Xem hồ sơ chi tiết</span>
        </button>
        {!locked && (
          <button type="button" role="menuitem" onClick={() => { setActionMenuId(null); setEnrollmentModalStudent(s); }}
            className={`${itemCls} text-sky-700 hover:bg-sky-50`}>
            <Plus size={15} className="shrink-0" />
            <span className="min-w-0">Thêm khóa học</span>
          </button>
        )}
        {!locked && (
          <button type="button" role="menuitem" onClick={async () => {
                setActionMenuId(null);
                setSubmittingAction(s.id + '-exam');
                try {
                  if (s.studentExamUnlocked) await revokeStudentExam(s.id);
                  else await approveStudentExam(s.id);
                } finally {
                  setSubmittingAction(null);
                }
              }}
              disabled={submittingAction === s.id + '-exam'}
            className={`${itemCls} text-slate-700 hover:bg-slate-50`}>
            {s.studentExamUnlocked
              ? <><Lock size={15} className="shrink-0 text-slate-500" /><span className="min-w-0">Khóa phòng thi</span></>
              : <><Unlock size={15} className="shrink-0 text-slate-500" /><span className="min-w-0">Cho phép thi</span></>}
          </button>
        )}
        {!locked && (
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              const webcamEnforced = s.requireWebcam === true;
              try {
                await ctxUpdateStudent(s.id || s._id, { requireWebcam: !webcamEnforced });
                toast.success(webcamEnforced ? 'Đã tắt giám sát webcam khi thi' : 'Đã bật giám sát webcam khi thi');
              } catch (e) {
                toast.error(e?.message || 'Không cập nhật được giám sát webcam');
              }
              setActionMenuId(null);
            }}
            className={`${itemCls} text-slate-700 hover:bg-slate-50`}
          >
            <Camera size={15} className="shrink-0 text-slate-500" />
            <span className="min-w-0">
              {s.requireWebcam === true ? 'Tắt webcam khi thi' : 'Bật webcam khi thi'}
            </span>
          </button>
        )}
        {!locked && (
          <button type="button" role="menuitem" onClick={() => { handlePrintInvoice(s); setActionMenuId(null); }}
            disabled={!studentHasActivePaid(s)}
            className={`${itemCls} ${
              studentHasActivePaid(s) ? 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700' : 'text-slate-300 cursor-not-allowed'
            }`}>
            <Printer size={15} className="shrink-0" />
            <span className="min-w-0">Xuất hóa đơn PDF</span>
          </button>
        )}
        {!locked && refundable && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setActionMenuId(null);
              onOpenRefund?.(s, refundable);
            }}
            className={`${itemCls} text-rose-700 hover:bg-rose-50`}
          >
            <CircleDollarSign size={15} className="shrink-0 text-rose-600" />
            <span className="min-w-0">Hoàn học phí</span>
          </button>
        )}
        {!locked && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setActionMenuId(null);
              window.dispatchEvent(new CustomEvent('open-reset-pw', {
                detail: {
                  userId: s.id || s._id,
                  userName: s.name || 'Học viên',
                  role: 'student',
                },
              }));
            }}
            className={`${itemCls} text-amber-800 hover:bg-amber-50`}
          >
            <KeyRound size={15} className="shrink-0 text-amber-600" />
            <span className="min-w-0">Cấp mật khẩu</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            setActionMenuId(null);
            const ok = await confirmAdminAction({
              title: 'Reset thiết bị',
              content: `Xóa danh sách trình duyệt đã ghi của ${s.name || 'học viên'}? Học viên sẽ gắn lại tối đa 2 trình duyệt trước khi hệ thống báo Admin.`,
              confirmText: 'Reset thiết bị',
              confirmButtonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
            });
            if (!ok) return;
            setSubmittingAction(s.id + '-reset-dev');
            try {
              const res = await api.students.resetDevices(s.id || s._id);
              if (!res?.success) throw new Error(res?.message || 'Không reset được thiết bị');
              await ctxUpdateStudent(s.id || s._id, { knownDeviceCount: 0 }, { localOnly: true });
              toast.success(res.message || 'Đã reset danh sách thiết bị');
            } catch (e) {
              toast.error(e?.message || 'Không reset được thiết bị');
            } finally {
              setSubmittingAction(null);
            }
          }}
          disabled={submittingAction === s.id + '-reset-dev'}
          className={`${itemCls} text-slate-700 hover:bg-slate-50`}
        >
          <Laptop size={15} className="shrink-0 text-slate-500" />
          <span className="min-w-0">Reset thiết bị</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            setActionMenuId(null);
            const lockedAcc = !!s.accountLocked;
            const ok = await confirmAdminAction({
              title: lockedAcc ? 'Mở khóa đăng nhập' : 'Khóa đăng nhập',
              content: lockedAcc
                ? `Cho phép ${s.name || 'học viên'} đăng nhập lại?`
                : `Khóa đăng nhập của ${s.name || 'học viên'}? Phiên hiện tại sẽ bị đăng xuất ngay.`,
              confirmText: lockedAcc ? 'Mở khóa' : 'Khóa đăng nhập',
              confirmButtonClass: lockedAcc
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                : 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
            });
            if (!ok) return;
            setSubmittingAction(s.id + '-lock-acc');
            try {
              const res = lockedAcc
                ? await api.students.unlockAccount(s.id || s._id)
                : await api.students.lockAccount(s.id || s._id);
              if (!res?.success) throw new Error(res?.message || 'Không cập nhật được khóa đăng nhập');
              await ctxUpdateStudent(s.id || s._id, { accountLocked: !lockedAcc }, { localOnly: true });
              toast.success(res.message || (lockedAcc ? 'Đã mở khóa đăng nhập' : 'Đã khóa đăng nhập'));
            } catch (e) {
              toast.error(e?.message || 'Không cập nhật được khóa đăng nhập');
            } finally {
              setSubmittingAction(null);
            }
          }}
          disabled={submittingAction === s.id + '-lock-acc'}
          className={`${itemCls} ${s.accountLocked ? 'text-emerald-700 hover:bg-emerald-50' : 'text-red-700 hover:bg-red-50'}`}
        >
          {s.accountLocked
            ? <><Unlock size={15} className="shrink-0" /><span className="min-w-0">Mở khóa đăng nhập</span></>
            : <><Lock size={15} className="shrink-0" /><span className="min-w-0">Khóa đăng nhập</span></>}
        </button>
        <div className="border-t border-slate-100 my-0.5" />
        <button type="button" role="menuitem" onClick={() => { setActionMenuId(null); removeStudent(s.id); }}
          className={`${itemCls} text-red-600 hover:bg-red-50`}>
          <Trash2 size={15} className="shrink-0" />
          <span className="min-w-0">Xóa học viên</span>
        </button>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="relative inline-flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActionMenuId(open ? null : s.id);
        }}
        className={buttonClassName}
        aria-label="Thao tác"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </div>
  );
}

function studentHasActivePaid(s, enrollments) {
  const list = Array.isArray(enrollments) ? enrollments : getActiveClientEnrollments(s);
  if (list.length > 0) return list.some(isEnrollmentPaidFlag);
  return !!s?.paid;
}

function PaidBadge({ paid }) {
  return (
    <span className={paid ? 'cms-students-badge-success' : 'cms-students-badge-primary'}>
      {paid ? 'Hoàn tất' : <><AlertTriangle size={10} /> Chưa nộp</>}
    </span>
  );
}

function ModeBranchBadges({ s, safeBranches }) {
  const mode = String(s?.learningMode || '').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
  const modeLabel = resolveLearningModeLabel(mode);
  const studentBid = toBranchId(s?.branchId);
  const branch = studentBid
    ? (safeBranches || []).find((b) => toBranchId(b._id || b.id) === studentBid)
    : null;
  const branchLabel = resolveBranchDisplayName(branch, mode);

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <span className={mode === 'ONLINE' ? 'cms-students-badge-info' : 'cms-students-badge-neutral'}>
        {mode === 'ONLINE'
          ? <><Globe size={10} aria-hidden="true" /> {modeLabel}</>
          : <><Building2 size={10} aria-hidden="true" /> {modeLabel}</>}
      </span>
      <span className="text-slate-300 select-none" aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 min-w-0">
        <MapPin size={10} className="shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">{branchLabel}</span>
      </span>
    </div>
  );
}

export default function AdminStudentsTab() {
  const [submittingAction, setSubmittingAction] = useState(null);
  const {
    search,
    setSearch, filterCourse, setFilterCourse, filterPaid, setFilterPaid,
    handleExportExcel, isExportingExcel, setShowImportModal, setShowModal,
    studentsPagination, filteredStudents, safeTeachers, safeBranches,
    assignTeacher, actionMenuId, setActionMenuId, setShowStudentDetailId,
    setEnrollmentModalStudent,
    approveStudentExam, revokeStudentExam, ctxUpdateStudent, toast,
    handlePrintInvoice, removeStudent, currentPage, setCurrentPage,
    examSubjectsCatalog, refreshStudentList,
  } = useAdminTab();

  const [dbCourses, setDbCourses] = useState([]);
  const [refundModal, setRefundModal] = useState(null); // { student, enr, reason, refundAmount, refundPercent, maxRefund }
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [purgingCancelled, setPurgingCancelled] = useState(false);
  const [draftSearch, setDraftSearch] = useState(search);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  useEffect(() => {
    if (draftSearch === search) return undefined;
    const t = window.setTimeout(() => setSearch(draftSearch), 280);
    return () => window.clearTimeout(t);
  }, [draftSearch, search, setSearch]);

  const searchSuggestions = useMemo(() => {
    const q = String(draftSearch || '').trim();
    if (!q) return [];
    return (filteredStudents || [])
      .filter((s) => matchesPersonSearch(q, {
        name: s.name,
        phone: s.phone,
        zalo: s.zalo,
        studentCode: s.studentCode,
        extra: s.course || '',
      }))
      .slice(0, 8);
  }, [draftSearch, filteredStudents]);

  const ghostCancelledCount = useMemo(
    () => (filteredStudents || []).filter(isStudentRowLocked).length,
    [filteredStudents],
  );

  const handlePurgeCancelledStudents = async () => {
    if (purgingCancelled) return;
    setPurgingCancelled(true);
    const tid = toast.loading('Đang kiểm tra học viên đã hủy khóa...');
    try {
      const preview = await api.students.purgeCancelled({ dryRun: true });
      toast.dismiss(tid);
      if (!preview?.success) {
        toast.error(preview?.message || 'Không kiểm tra được');
        return;
      }
      const count = preview.data?.count || 0;
      if (count <= 0) {
        toast.success('Không có học viên ghost (chỉ còn khóa đã hủy/hoàn)');
        return;
      }
      const names = (preview.data?.names || []).slice(0, 8).join(', ');
      const ok = await window.cmsConfirm(
        `Tìm thấy ${count} học viên chỉ còn khóa đã hủy/hoàn.\n`
        + (names ? `Ví dụ: ${names}${count > 8 ? '…' : ''}\n\n` : '\n')
        + 'Xóa VĨNH VIỄN các tài khoản này? (Lịch học & chat liên quan cũng được dọn. Hóa đơn/sổ cái giữ lại để đối soát.)',
      );
      if (!ok) return;
      const tid2 = toast.loading(`Đang xóa ${count} học viên...`);
      const res = await api.students.purgeCancelled({ dryRun: false });
      toast.dismiss(tid2);
      if (res?.success) {
        toast.success(res.message || `Đã xóa ${res.data?.deleted || 0} học viên`);
        refreshStudentList?.();
      } else {
        toast.error(res?.message || 'Xóa thất bại');
      }
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err?.message || 'Lỗi kết nối API');
    } finally {
      setPurgingCancelled(false);
    }
  };

  const openRefundModal = (student, enr) => {
    const enrId = enr?.enrollmentId || enr?.id || enr?._id;
    if (!enrId || enrId === 'main') {
      toast.error('Không xác định được khóa để hoàn. Mở hồ sơ chi tiết để hủy khóa.');
      return;
    }
    const maxRefund = Number(enr.price) || 0;
    setRefundModal({
      student,
      enr,
      enrId,
      reason: '',
      refundAmount: maxRefund,
      refundPercent: maxRefund > 0 ? 100 : 0,
      maxRefund,
    });
  };

  const handleConfirmRefund = async () => {
    if (!refundModal || refundSubmitting) return;
    const sid = refundModal.student?.id || refundModal.student?._id;
    const { enrId, reason, refundAmount } = refundModal;
    setRefundSubmitting(true);
    const tid = toast.loading('Đang hoàn học phí...');
    try {
      const res = await api.students.deleteEnrollment(sid, enrId, {
        cancelReason: reason || 'Admin hoàn học phí',
        refundAmount: Number(refundAmount) || 0,
      });
      toast.dismiss(tid);
      if (res?.success) {
        toast.success(res.message || 'Đã hủy khóa và hoàn học phí');
        setRefundModal(null);
        refreshStudentList?.();
      } else {
        toast.error(res?.message || 'Không hoàn được học phí');
      }
    } catch {
      toast.dismiss(tid);
      toast.error('Lỗi kết nối API');
    } finally {
      setRefundSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/courses');
        const json = await res.json();
        if (!cancelled && json?.success && Array.isArray(json.data)) {
          setDbCourses(json.data);
        }
      } catch {
        /* ignore — giữ dropdown rỗng */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const courseFilterOptions = useMemo(() => {
    const list = (dbCourses || [])
      .filter((c) => c && c.name && String(c.status || 'published') !== 'archived')
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    const seen = new Set();
    return list.filter((c) => {
      const key = String(c.name).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [dbCourses]);

  useEffect(() => {
    if (filterCourse === 'all' || !filterCourse) return;
    if (!courseFilterOptions.length) return;
    const ok = courseFilterOptions.some(
      (c) => String(c.name).toLowerCase() === String(filterCourse).toLowerCase()
        || String(c._id) === String(filterCourse),
    );
    if (!ok) setFilterCourse('all');
  }, [courseFilterOptions, filterCourse, setFilterCourse]);

  const assignableTeachers = (safeTeachers || []).filter(
    (t) => t && (t.role == null || t.role === 'teacher') && isTeacherActive(t.status),
  );

  const teachersForCourse = (courseOrEnrollment, currentTeacherId = '', studentBranchId = '') => {
    const matched = [];
    const other = [];
    const cur = String(currentTeacherId || '');
    const branchId = toBranchId(studentBranchId);
    for (const t of assignableTeachers) {
      const tid = String(t.id || t._id);
      const sameBranch = teacherInStudentBranch(t, branchId) || (cur && tid === cur);
      if (!sameBranch) {
        other.push({ ...t, _branchMismatch: true });
        continue;
      }
      if (teacherMatchesCourse(t, courseOrEnrollment, examSubjectsCatalog) || (cur && tid === cur)) {
        matched.push(t);
      } else {
        other.push(t);
      }
    }
    return { matched, other };
  };

  const handleAssignTeacher = async (studentId, teacherId, enrollmentId) => {
    const sid = studentId;
    if (!sid) {
      toast.error('Không xác định được học viên');
      return;
    }
    try {
      await assignTeacher(sid, teacherId, enrollmentId);
      toast.success(teacherId ? 'Đã phân công giảng viên' : 'Đã bỏ phân công');
    } catch (err) {
      toast.error(err?.message || 'Không phân công được giảng viên');
    }
  };

  const menuProps = {
      submittingAction, setSubmittingAction,
    actionMenuId, setActionMenuId, setShowStudentDetailId,
    setEnrollmentModalStudent, approveStudentExam, revokeStudentExam,
    ctxUpdateStudent, toast, handlePrintInvoice, removeStudent,
    onOpenRefund: openRefundModal,
  };

  const selectFilterClass =
    'w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 outline-none cursor-pointer transition-all';

  const teacherSelectClass =
    'w-full min-w-0 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs sm:text-sm font-medium text-slate-700 outline-none focus:border-sky-400 cursor-pointer';
  const teacherSelectWrapClass = 'w-full max-w-full';

  const renderTeacherSelects = (s, enrollments, hasMultiCourse, primaryEnr, teacherVal) => {
    const studentBranchId = s?.branchId;
    if (hasMultiCourse) {
      return (
        <div className="space-y-2">
          {enrollments.map((enr) => {
            const enrTeacherVal = enr.teacherId || '';
            const enrId = enr.enrollmentId || enr.id;
            const courseLabel = enr.courseName || enr.name || '';
            const { matched, other } = teachersForCourse(enr, enrTeacherVal, studentBranchId);
            return (
              <div key={enrId} className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-sky-700 truncate" title={courseLabel}>{courseLabel}</p>
                <CmsSelect
                  value={enrTeacherVal}
                  onChange={(e) => {
                    e?.stopPropagation?.();
                    handleAssignTeacher(s.id || s._id, e.target.value || null, enrId !== 'main' ? enrId : undefined);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={teacherSelectClass}
                  wrapperClassName={teacherSelectWrapClass}
                >
                  <option value="">Chưa phân công</option>
                  {matched.map((t) => (
                    <option key={t.id || t._id} value={String(t.id || t._id)}>{t.name}</option>
                  ))}
                  {other.map((t) => (
                    <option key={t.id || t._id} value={String(t.id || t._id)} disabled>
                      {t._branchMismatch ? `${t.name} (khác chi nhánh)` : `${t.name} (khác môn)`}
                    </option>
                  ))}
                </CmsSelect>
              </div>
            );
          })}
        </div>
      );
    }
    const courseRef = primaryEnr || s.course;
    const { matched, other } = teachersForCourse(courseRef, teacherVal, studentBranchId);
    return (
      <CmsSelect
        value={teacherVal ? String(teacherVal) : ''}
        onChange={(e) => {
          e?.stopPropagation?.();
          handleAssignTeacher(s.id || s._id, e.target.value || null, primaryEnr?.enrollmentId !== 'main' ? primaryEnr?.enrollmentId : undefined);
        }}
        onClick={(e) => e.stopPropagation()}
        className={teacherSelectClass}
        wrapperClassName={teacherSelectWrapClass}
      >
        <option value="">Chưa phân công</option>
        {matched.map((t) => (
          <option key={t.id || t._id} value={String(t.id || t._id)}>{t.name}</option>
        ))}
        {other.map((t) => (
          <option key={t.id || t._id} value={String(t.id || t._id)} disabled>
            {t._branchMismatch ? `${t.name} (khác chi nhánh)` : `${t.name} (khác môn)`}
          </option>
        ))}
      </CmsSelect>
    );
  };

  const renderTuition = (s, enrollments, hasMultiCourse) => {
    const refundedTotal = getStudentRefundedTotal(s);
    if (hasMultiCourse) {
      return (
        <div className="space-y-1.5">
          {enrollments.map((enr) => {
            const enrId = enr.enrollmentId || enr.id;
            return (
              <div key={enrId}>
                <p className="text-sm font-semibold text-slate-800">
                  {(Number(enr.price) || 0).toLocaleString('vi-VN')}đ
                </p>
                <p className="text-xs text-slate-500">
                  {(enr.completedSessions || 0)}/{(enr.totalSessions || 12)} buổi
                </p>
              </div>
            );
          })}
          <RefundHint amount={refundedTotal} />
        </div>
      );
    }
    return (
      <>
        <p className="text-sm font-semibold text-slate-800">{(s.price || 0).toLocaleString('vi-VN')}đ</p>
        <RefundHint amount={refundedTotal} />
        <p className="text-xs text-slate-500 mt-0.5">Tiến độ: {(s.completedSessions || 0)}/{(s.totalSessions || 12)} buổi</p>
      </>
    );
  };

  const renderPaid = (s, enrollments) => {
    const list = Array.isArray(enrollments) ? enrollments : [];
    if (list.length > 1) {
      return (
        <div className="flex flex-col gap-1.5 items-start">
          {list.map((enr) => (
            <PaidBadge key={enr.enrollmentId || enr.id} paid={isEnrollmentPaidFlag(enr)} />
          ))}
        </div>
      );
    }
    if (list.length === 1) {
      return <PaidBadge paid={isEnrollmentPaidFlag(list[0])} />;
    }
    return <PaidBadge paid={!!s.paid} />;
  };

  return (
    <div className="cms-students-module cms-viewport-module bg-white rounded-2xl lg:rounded-[28px] border border-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.04)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Title + actions */}
      <div className="px-3 pt-3 pb-2 sm:px-4 lg:px-6 lg:pt-4 space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <h2 className="text-base font-semibold text-slate-900 flex items-start gap-2 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 break-words leading-snug">Quản lý Học Viên</span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg flex-shrink-0 self-center">
              {studentsPagination.totalRecords}
            </span>
          </h2>
        </div>

        {/* Sticky search */}
        <div className="cms-students-search-sticky -mx-3 px-3 py-2 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0 lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:py-0">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchFocused(false), 180);
              }}
              className="pl-10 pr-3 h-11 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/15 outline-none w-full transition-all"
              placeholder="Tìm họ, tên đệm, tên, SĐT..."
              aria-label="Tìm học viên"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={searchFocused && searchSuggestions.length > 0}
            />
            {searchFocused && String(draftSearch || '').trim() && searchSuggestions.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
                role="listbox"
              >
                {searchSuggestions.map((s) => (
                  <li key={s.id || s._id} role="option">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-red-50 transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const name = String(s.name || '').trim();
                        setDraftSearch(name);
                        setSearch(name);
                        setSearchFocused(false);
                      }}
                    >
                      <span className="block text-sm font-medium text-slate-800 truncate">{s.name}</span>
                      {s.phone ? (
                        <span className="block text-[11px] text-slate-400">{s.phone}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Branch + Status (+ Course) — one wrapping row */}
        <div className="cms-students-filters">
          <div className="lg:hidden">
            <BranchFilterDropdown fullWidth />
          </div>
          <CmsSelect
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className={selectFilterClass}
          >
            <option value="all">Tất cả khóa học</option>
            {courseFilterOptions.map((c) => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </CmsSelect>
          <CmsSelect
            value={filterPaid}
            onChange={(e) => setFilterPaid(e.target.value)}
            className={selectFilterClass}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="paid">Đã đóng phí</option>
            <option value="unpaid">Chưa nộp phí</option>
            <option value="refunded">Hoàn học phí</option>
          </CmsSelect>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 min-w-0 sm:flex sm:flex-wrap sm:items-stretch">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="cms-students-btn-primary col-span-2 sm:col-auto sm:order-last sm:ml-auto !px-3"
          >
            <Plus size={15} className="shrink-0" />
            Thêm học viên
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="cms-students-btn-outline !px-2.5 min-w-0"
            title="Xuất Excel"
          >
            {isExportingExcel
              ? <Loader2 size={15} className="animate-spin shrink-0" />
              : <Download size={15} className="shrink-0" />}
            <span>Xuất</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="cms-students-btn-outline !px-2.5 min-w-0"
            title="Import Excel"
          >
            <FileSpreadsheet size={15} className="shrink-0" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={handlePurgeCancelledStudents}
            disabled={purgingCancelled}
            className="cms-students-btn-outline col-span-2 sm:col-auto !px-2.5 min-w-0 text-rose-700 border-rose-200 hover:bg-rose-50"
            title="Xóa vĩnh viễn HV chỉ còn khóa đã hủy/hoàn (ghost)"
          >
            {purgingCancelled
              ? <Loader2 size={15} className="animate-spin shrink-0" />
              : <Trash2 size={15} className="shrink-0" />}
            <span>
              Dọn HV hủy khóa{ghostCancelledCount > 0 ? ` (${ghostCancelledCount})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* ── MOBILE / TABLET CARDS (< lg) ─────────────────────────── */}
      <div className="lg:hidden px-3 pb-3 sm:px-4 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users size={24} className="opacity-40" />
            </div>
            {(studentsPagination?.totalRecords || 0) === 0 && !search && filterPaid === 'all' && !filterCourse ? (
              <>
                <p className="text-sm font-semibold text-slate-600">Chưa có học viên</p>
                <p className="text-xs text-slate-400 mt-1">Thêm học viên mới để bắt đầu quản lý</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-600">Không tìm thấy học viên nào</p>
                <p className="text-xs text-slate-400 mt-1">Thử đổi bộ lọc hoặc từ khóa</p>
              </>
            )}
          </div>
        ) : filteredStudents.map((s) => {
          const locked = isStudentRowLocked(s);
          const allEnrollments = getClientEnrollments(s);
          const enrollments = getActiveClientEnrollments(s);
          const hasMultiCourse = enrollments.length > 1;
          const primaryEnr = enrollments.find((e) => e.isPrimary) || enrollments[0]
            || allEnrollments.find((e) => e.status === 'cancelled' || e.status === 'refunded')
            || allEnrollments[0];
          const teacherVal = (() => {
            const fromEnr = primaryEnr?.teacherId || '';
            if (fromEnr) return String(fromEnr);
            if (typeof s.teacherId === 'object' && s.teacherId !== null) {
              return String(s.teacherId._id || s.teacherId.id || '');
            }
            return s.teacherId ? String(s.teacherId) : '';
          })();
          const regDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '';
          return (
            <article
              key={s.id}
              className={`cms-students-card transition-opacity ${locked ? 'opacity-55 select-none grayscale-[0.35]' : ''}`}
              aria-disabled={locked || undefined}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  size="card"
                  initials={s.name?.substring(0, 2).toUpperCase() || 'HV'}
                  name={s.name}
                  role="student"
                  src={s.avatar}
                  gender={s.gender}
                  color={studentHasActivePaid(s, enrollments) ? 'bg-sky-500' : 'bg-red-500'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 leading-snug truncate">{s.name}</h3>
                      <DeviceAccountBadges student={s} />
                      <p className="text-xs text-slate-500 mt-0.5">
                        {regDate}{s.phone ? ` · ${s.phone}` : ''}
                      </p>
                    </div>
                    <StudentRowActions
                      s={s}
                      {...menuProps}
                      align="right"
                      buttonClassName="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                    />
                  </div>

                  <div className="mt-2 space-y-1.5">
                    <p className={`text-sm font-semibold leading-snug break-words ${locked ? 'text-slate-500 line-through' : 'text-sky-700'}`}>
                      {primaryEnr?.courseName || primaryEnr?.name || s.course}
                    </p>
                    {enrollments.length > 1 && (
                      <p className="text-xs font-semibold text-sky-600">
                        +{enrollments.length - 1} khóa khác
                      </p>
                    )}
                    {locked && (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đã hoàn · khóa thao tác</p>
                    )}
                    <ModeBranchBadges s={s} safeBranches={safeBranches} />
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(4.5rem,0.9fr)_minmax(4.25rem,auto)] gap-x-2 gap-y-2 items-start min-w-0">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide hidden sm:block">Giảng viên HD</p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide hidden sm:block">Học phí</p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right hidden sm:block">Trạng thái</p>

                  {hasMultiCourse ? (
                    <>
                      {enrollments.map((enr) => {
                        const enrId = enr.enrollmentId || enr.id;
                        const enrTeacherVal = enr.teacherId || '';
                        const courseLabel = enr.courseName || enr.name || '';
                        const { matched, other } = teachersForCourse(enr, enrTeacherVal, s?.branchId);
                        return (
                          <div key={enrId} className="contents">
                            <div className="min-w-0 space-y-1">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden">Giảng viên HD</p>
                              <p className="text-[11px] font-semibold text-sky-700 truncate" title={courseLabel}>
                                {courseLabel}
                              </p>
                              <CmsSelect
                                value={enrTeacherVal}
                                onChange={(e) => {
                                  e?.stopPropagation?.();
                                  handleAssignTeacher(s.id || s._id, e.target.value || null, enrId !== 'main' ? enrId : undefined);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={teacherSelectClass}
                                wrapperClassName={teacherSelectWrapClass}
                              >
                                <option value="">Chưa phân công</option>
                                {matched.map((t) => (
                                  <option key={t.id || t._id} value={String(t.id || t._id)}>{t.name}</option>
                                ))}
                                {other.map((t) => (
                                  <option key={t.id || t._id} value={String(t.id || t._id)} disabled>
                                    {t._branchMismatch ? `${t.name} (khác chi nhánh)` : `${t.name} (khác môn)`}
                                  </option>
                                ))}
                              </CmsSelect>
                            </div>
                            <div className="min-w-0 pt-0.5">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden">Học phí</p>
                              <p className="text-sm font-semibold text-slate-800 leading-tight tabular-nums">
                                {(Number(enr.price) || 0).toLocaleString('vi-VN')}đ
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {(enr.completedSessions || 0)}/{(enr.totalSessions || 12)} buổi
                              </p>
                            </div>
                            <div className="flex justify-start sm:justify-end pt-0.5 min-w-0">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden mr-2 self-center">Trạng thái</p>
                              <PaidBadge paid={isEnrollmentPaidFlag(enr)} />
                            </div>
                          </div>
                        );
                      })}
                      {getStudentRefundedTotal(s) > 0 ? (
                        <div className="contents">
                          <div aria-hidden="true" className="hidden sm:block" />
                          <div className="min-w-0">
                            <RefundHint amount={getStudentRefundedTotal(s)} />
                          </div>
                          <div aria-hidden="true" className="hidden sm:block" />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden mb-1">Giảng viên HD</p>
                        {locked ? (
                          <span className="text-xs text-slate-400 font-semibold">—</span>
                        ) : (
                          renderTeacherSelects(s, enrollments, false, primaryEnr, teacherVal)
                        )}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden mb-1">Học phí</p>
                        {renderTuition(s, enrollments.length ? enrollments : (primaryEnr ? [primaryEnr] : []), false)}
                      </div>
                      <div className="flex justify-start sm:justify-end pt-0.5 min-w-0 items-center gap-2">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:hidden">Trạng thái</p>
                        {locked ? (
                          <span className="cms-students-badge-neutral text-slate-400">Đã hoàn</span>
                        ) : (
                          renderPaid(s, enrollments)
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── DESKTOP TABLE (≥ lg) ─────────────────────────────────── */}
      <div className="hidden lg:block cms-table-wrap overscroll-x-contain flex-1 min-h-0 overflow-auto touch-pan-x">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-100 bg-slate-50/95 backdrop-blur-sm">
              <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/95">Học viên</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/95">Khóa học</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/95">Giáo viên</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50/95">Học phí</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center bg-slate-50/95">Trạng thái</th>
              <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-14 bg-slate-50/95" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center text-slate-400">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users size={28} className="opacity-30" />
                  </div>
                  <p className="text-sm font-semibold">Không tìm thấy học viên nào</p>
                  <p className="text-xs text-slate-400 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                </td>
              </tr>
            ) : filteredStudents.map((s) => {
              const locked = isStudentRowLocked(s);
              const allEnrollments = getClientEnrollments(s);
              const enrollments = getActiveClientEnrollments(s);
              const hasMultiCourse = enrollments.length > 1;
              const primaryEnr = enrollments.find((e) => e.isPrimary) || enrollments[0]
                || allEnrollments.find((e) => e.status === 'cancelled' || e.status === 'refunded')
                || allEnrollments[0];
              const teacherVal = (() => {
                const fromEnr = primaryEnr?.teacherId || '';
                if (fromEnr) return String(fromEnr);
                if (typeof s.teacherId === 'object' && s.teacherId !== null) {
                  return String(s.teacherId._id || s.teacherId.id || '');
                }
                return s.teacherId ? String(s.teacherId) : '';
              })();
              const regDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '';
              return (
                <tr
                  key={s.id}
                  className={`group transition-opacity ${locked ? 'opacity-55 select-none grayscale-[0.35]' : 'hover:bg-slate-50/80'}`}
                  aria-disabled={locked || undefined}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        size="card"
                        initials={s.name?.substring(0, 2).toUpperCase() || 'HV'}
                        name={s.name}
                        role="student"
                        src={s.avatar}
                        gender={s.gender}
                        color={studentHasActivePaid(s, enrollments) ? 'bg-sky-500' : 'bg-red-500'}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-base leading-snug truncate max-w-[200px]">{s.name}</p>
                        <DeviceAccountBadges student={s} />
                        <p className="text-xs text-slate-500 mt-0.5">{regDate}{s.phone ? ` · ${s.phone}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium leading-tight block truncate max-w-[180px] ${locked ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                      {primaryEnr?.courseName || primaryEnr?.name || s.course}
                    </span>
                    {enrollments.length > 1 && (
                      <span className="text-xs font-semibold text-sky-600 mt-0.5 block">
                        +{enrollments.length - 1} khóa khác
                      </span>
                    )}
                    {locked && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5 block">Đã hoàn</span>
                    )}
                    <div className="mt-1.5">
                      <ModeBranchBadges s={s} safeBranches={safeBranches} />
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[180px] max-w-[260px]">
                    {locked ? (
                      <span className="text-xs text-slate-400 font-semibold">—</span>
                    ) : (
                      renderTeacherSelects(s, enrollments, hasMultiCourse, primaryEnr, teacherVal)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {renderTuition(s, enrollments.length ? enrollments : (primaryEnr ? [primaryEnr] : []), hasMultiCourse)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5">
                      {locked ? (
                        <span className="cms-students-badge-neutral text-slate-400">Đã hoàn</span>
                      ) : (
                        renderPaid(s, enrollments)
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StudentRowActions s={s} {...menuProps} align="right" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-3 py-3 sm:px-4 lg:px-6 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 min-w-0">
        <p className="text-xs text-slate-500 font-medium text-center sm:text-left min-w-0">
          Hiển thị {filteredStudents.length} / {studentsPagination.totalRecords} học viên · Trang {studentsPagination.currentPage}/{studentsPagination.totalPages}
        </p>
        <div className="flex items-center gap-1 max-w-full overflow-x-auto overscroll-x-contain pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 justify-center">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={14} />
          </button>
          {(() => {
            const tp = studentsPagination.totalPages;
            const cp = currentPage;
            const pages = [];
            if (tp <= 7) {
              for (let i = 1; i <= tp; i++) pages.push(i);
            } else {
              pages.push(1);
              if (cp > 3) pages.push('...');
              for (let i = Math.max(2, cp - 1); i <= Math.min(tp - 1, cp + 1); i++) pages.push(i);
              if (cp < tp - 2) pages.push('...');
              pages.push(tp);
            }
            return pages.map((p, idx) => (
              p === '...' ? (
                <span key={`dot-${idx}`} className="w-9 h-9 shrink-0 flex items-center justify-center text-slate-300 text-xs">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`w-9 h-9 shrink-0 rounded-lg text-sm font-semibold transition-all ${
                    p === cp
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >{p}</button>
              )
            ));
          })()}
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(studentsPagination.totalPages, p + 1))}
            disabled={currentPage >= studentsPagination.totalPages}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {refundModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !refundSubmitting && setRefundModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 z-10 border border-red-100 max-h-[min(92dvh,900px)] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center gap-3 mb-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <CircleDollarSign size={18} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-800">Hoàn học phí</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5 leading-snug">
                  Hủy khóa + hoàn tiền · HV vẫn hiện trong danh sách (mờ). Muốn mất hẳn: menu ⋮ › Xóa học viên, hoặc nút &quot;Dọn HV hủy khóa&quot;.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 min-w-0">
              <p className="text-xs font-black text-red-700 uppercase tracking-wide mb-0.5">Khóa học bị hủy</p>
              <p className="text-sm font-bold text-slate-800 break-words">{refundModal.enr.courseName || refundModal.enr.name}</p>
              <p className="text-xs text-red-600 mt-1">
                Đã thanh toán:{' '}
                <strong>{Number(refundModal.enr.price || 0).toLocaleString('vi-VN')}đ</strong>
              </p>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">Lý do hủy</label>
                <input
                  type="text"
                  value={refundModal.reason}
                  onChange={(e) => setRefundModal((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Nhập lý do hủy khóa..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none min-w-0"
                />
              </div>
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end min-w-0">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">
                      Số tiền hoàn
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={refundModal.maxRefund}
                      step={1000}
                      value={refundModal.refundAmount}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRefundModal((p) => {
                          const max = Number(p.maxRefund) || 0;
                          const amt = Math.min(Math.max(0, Number(raw) || 0), max);
                          const pct = max > 0 ? Math.round((amt / max) * 1000) / 10 : 0;
                          return { ...p, refundAmount: amt, refundPercent: pct };
                        });
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-red-300 outline-none min-w-0"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Tối đa {Number(refundModal.maxRefund).toLocaleString('vi-VN')}đ
                    </p>
                  </div>
                  <div className="w-full sm:w-[96px] shrink-0">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">% hoàn</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={refundModal.refundPercent ?? 0}
                        onChange={(e) => {
                          setRefundModal((p) => {
                            const max = Number(p.maxRefund) || 0;
                            const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                            const amt = Math.min(max, Math.round((max * pct) / 100));
                            return { ...p, refundPercent: pct, refundAmount: amt };
                          });
                        }}
                        className="w-full border border-slate-200 rounded-xl pl-3 pr-7 py-2 text-sm font-semibold focus:ring-2 focus:ring-red-300 outline-none"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Mặc định 100%. Đổi tiền hoặc % — hai ô đồng bộ. Nhập 0 nếu không hoàn.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse min-[400px]:flex-row gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setRefundModal(null)}
                disabled={refundSubmitting}
                className="flex-1 min-h-11 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                Giữ lại
              </button>
              <button
                type="button"
                onClick={handleConfirmRefund}
                disabled={refundSubmitting}
                className="flex-1 min-h-11 px-3 py-2.5 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 min-w-0 text-center leading-tight"
              >
                {refundSubmitting ? <Loader2 size={14} className="animate-spin shrink-0" /> : null}
                <span className="min-w-0 break-words">
                  {Number(refundModal.refundAmount) > 0
                    ? (
                      <>
                        <span className="min-[400px]:hidden">Hoàn {Number(refundModal.refundAmount).toLocaleString('vi-VN')}đ</span>
                        <span className="hidden min-[400px]:inline">{`Hủy & hoàn ${Number(refundModal.refundAmount).toLocaleString('vi-VN')}đ`}</span>
                      </>
                    )
                    : 'Xác nhận hủy'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
