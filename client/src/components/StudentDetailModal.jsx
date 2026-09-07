import React, { useState, useEffect } from 'react';
import CmsSelect from './ui/CmsSelect';
import { resolveAvatarUrl } from '../utils/defaultAvatars';
import {
  X, User, BookOpen, Clock, DollarSign, Trophy, 
  MapPin, Phone, Calendar, ChevronRight,
  TrendingUp, CreditCard, ClipboardList, ShieldCheck, 
  Printer, Loader2, AlertCircle, CheckCircle2, Star,
  Smartphone, Hash, ArrowUpRight, Building2, Plus, Download, Trash2, Edit3, Award,
  Laptop, Lock, Unlock,
} from 'lucide-react';
import api from '../services/api';
import { useModal } from '../utils/Modal.jsx';
import { useData } from '../context/DataContext';
import { getClientEnrollments, hasLearningAccessEnrollment } from '../utils/enrollments';
import { teacherMatchesCourse } from '../utils/examSubjects';
import { teacherInStudentBranch, toBranchId } from '../utils/branchIds';
import AddEnrollmentModal from './admin/shared/AddEnrollmentModal';
import { useToast } from '../utils/toast';
import { getAttendanceAction, attendanceToneClass } from '../utils/attendanceAction';
import ZaloIcon from './ZaloIcon';
import { formatStudentGradeNote } from '../utils/studentActivityLogs';

const fmt = (n) => n ? Number(n).toLocaleString('vi-VN') + 'đ' : '0đ';
const fmtTuition = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v >= 10_000_000) {
    const tr = (v / 1_000_000).toLocaleString('vi-VN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
    return `${tr} tr`;
  }
  return v.toLocaleString('vi-VN') + 'đ';
};
const enrollmentRemaining = (enr) => {
  if (enr?.remainingSessions != null && enr.remainingSessions !== '') {
    return Math.max(0, Number(enr.remainingSessions) || 0);
  }
  const total = Number(enr?.totalSessions) || 12;
  const done = Number(enr?.completedSessions) || 0;
  return Math.max(0, total - done);
};
const isEnrollmentPaid = (e) =>
  e?.paid === true || e?.paid === 'Đã đóng phí' || e?.paid === 'true' || e?.paid === 1;

const isRefundInvoice = (inv) => {
  const ma = String(inv?.maHoaDon || '');
  const ghi = String(inv?.ghiChu || '');
  return ma.startsWith('R-') || /hoàn/i.test(ghi) || /refund/i.test(ghi);
};

const courseKeyOf = (name) => String(name || '').trim().toLowerCase();

/** Khóa hủy/hoàn: hiện trong filter nhưng không chọn được. */
const isEnrollmentFilterLocked = (e) => {
  const st = String(e?.status || '').toLowerCase();
  return st === 'cancelled' || st === 'refunded';
};

const enrollmentFilterLockLabel = (e) => {
  const st = String(e?.status || '').toLowerCase();
  if (st === 'refunded' || Number(e?.refundedAmount) > 0) return 'Đã hoàn';
  if (st === 'cancelled') return 'Đã hủy';
  return '';
};

/** Display-only: real invoice codes from maHoaDon / sourceRef (never write back to DB). */
const isValidInvoiceDisplayCode = (raw) => {
  const v = String(raw ?? '').trim();
  if (!v) return false;
  const upper = v.toUpperCase();
  if (v === '—' || upper === 'HĐ' || upper === 'HD' || upper === 'HOÀN') return false;
  // Ledger refund stubs are not display invoice codes
  if (/^cancel:/i.test(v)) return false;
  return true;
};

const resolveInvoiceDisplayCode = ({ maHoaDon, sourceRef } = {}) => {
  if (isValidInvoiceDisplayCode(maHoaDon)) return String(maHoaDon).trim();
  if (isValidInvoiceDisplayCode(sourceRef)) return String(sourceRef).trim();
  return null;
};

/** Parse enrollmentId from ledger refund sourceRef `cancel:{studentId}:{enrollmentId}`. */
const enrollmentIdFromCancelRef = (sourceRef) => {
  const m = String(sourceRef || '').match(/^cancel:[^:]+:(.+)$/i);
  return m ? String(m[1]).trim() : '';
};

/**
 * Refund display code: ưu tiên mã HĐ thu gốc (cùng enrollment / khóa),
 * không dùng raw `cancel:…`, không bịa HOÀN-#### nếu còn map được.
 */
const resolveRefundLinkedInvoiceCode = ({
  line,
  allLines = [],
  invoiceList = [],
} = {}) => {
  const direct = resolveInvoiceDisplayCode({
    maHoaDon: line?.maHoaDon,
    sourceRef: line?.sourceRef,
  });
  if (direct) return direct;

  const lines = Array.isArray(allLines) ? allLines : [];
  const invoices = Array.isArray(invoiceList) ? invoiceList : [];

  if (line?.reversesEntryId) {
    const orig = lines.find((l) => String(l?._id) === String(line.reversesEntryId));
    const fromReverse = resolveInvoiceDisplayCode({
      maHoaDon: orig?.maHoaDon,
      sourceRef: orig?.sourceRef,
    });
    if (fromReverse) return fromReverse;
  }

  const enrId = String(line?.enrollmentId || '').trim()
    || enrollmentIdFromCancelRef(line?.sourceRef);

  const paymentCodeFromLine = (p) => resolveInvoiceDisplayCode({
    maHoaDon: p?.maHoaDon,
    sourceRef: p?.sourceRef,
  });

  if (enrId) {
    const payments = lines
      .filter((l) => {
        if (!l || l.type === 'refund') return false;
        return String(l.enrollmentId || '').trim() === enrId;
      })
      .slice()
      .sort((a, b) => new Date(b.postedAt || b.createdAt || 0) - new Date(a.postedAt || a.createdAt || 0));
    for (const p of payments) {
      const code = paymentCodeFromLine(p);
      if (code) return code;
    }
  }

  const courseKey = courseKeyOf(line?.courseName || line?.khoaHoc);
  if (courseKey) {
    const coursePayments = lines
      .filter((l) => {
        if (!l || l.type === 'refund') return false;
        return courseKeyOf(l.courseName) === courseKey;
      })
      .slice()
      .sort((a, b) => new Date(b.postedAt || b.createdAt || 0) - new Date(a.postedAt || a.createdAt || 0));
    for (const p of coursePayments) {
      const code = paymentCodeFromLine(p);
      if (code) return code;
    }

    const invPayments = invoices
      .filter((inv) => !isRefundInvoice(inv) && courseKeyOf(inv?.khoaHoc) === courseKey)
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.ngayXuat || 0) - new Date(a.createdAt || a.ngayXuat || 0));
    for (const inv of invPayments) {
      if (isValidInvoiceDisplayCode(inv?.maHoaDon)) return String(inv.maHoaDon).trim();
    }
  }

  return null;
};

const summarizeEnrollments = (list) => {
  const items = Array.isArray(list) ? list : [];
  // Khóa đã hủy/hoàn không còn tính vào học phí đang theo & số đã thu
  const activeItems = items.filter((e) => e?.status !== 'cancelled');
  const cancelledItems = items.filter((e) => e?.status === 'cancelled');
  const totalSessions = activeItems.reduce((s, e) => s + (Number(e.totalSessions) || 12), 0);
  const completedSessions = activeItems.reduce((s, e) => s + (Number(e.completedSessions) || 0), 0);
  const remainingSessions = activeItems.reduce((s, e) => s + enrollmentRemaining(e), 0);
  const price = activeItems.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const paidItems = activeItems.filter(isEnrollmentPaid);
  const paidPrice = paidItems.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const paidCount = paidItems.length;
  const refundedTotal = cancelledItems.reduce((s, e) => s + (Number(e.refundedAmount) || 0), 0);
  const progressPercent = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const grades = activeItems.map((e) => Number(e.avgGrade)).filter((g) => Number.isFinite(g) && g > 0);
  const avgGrade = grades.length
    ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10
    : null;
  return {
    totalSessions,
    completedSessions,
    remainingSessions,
    price,
    paidPrice,
    paidCount,
    enrollmentCount: activeItems.length,
    cancelledCount: cancelledItems.length,
    refundedTotal,
    progressPercent,
    avgGrade,
  };
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const fmtScheduleTimeRange = (sch) => {
  const start = String(sch?.startTime || '').trim();
  const end = String(sch?.endTime || '').trim();
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  if (end) return end;
  return '';
};
/** Parse và format ghi chú điểm danh thành text đẹp */
const formatScheduleNote = (note) => {
  if (!note) return null;
  const raw = String(note);
  // [ADMIN_MAKEUP] Tên @ ISO[ · buổi N/T] [| ghi chú cũ]
  const makeupMatch = raw.match(
    /^\[ADMIN_MAKEUP\]\s*(.+?)\s*@\s*([^\s|]+)(?:\s*·\s*buổi\s+(\d+)(?:\/(\d+))?)?(?:\s*\|\s*(.*))?$/s,
  );
  if (makeupMatch) {
    const who = makeupMatch[1].trim();
    const when = new Date(makeupMatch[2].trim());
    const whenFmt = Number.isNaN(when.getTime()) ? makeupMatch[2] : when.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const ordinal = makeupMatch[3];
    const total = makeupMatch[4];
    const rest = (makeupMatch[5] || '').trim();
    const buoi = ordinal
      ? (total ? ` buổi thứ ${ordinal}/${total}` : ` buổi thứ ${ordinal}`)
      : '';
    const base = `Điểm danh bù${buoi} bởi ${who} lúc ${whenFmt}`;
    return rest ? `${base} | ${rest}` : base;
  }
  return raw;
};

/** Ước lượng buổi thứ N sau điểm danh bù (preview UI — server là nguồn chuẩn). */
const previewMakeupSession = (sch, student) => {
  if (!sch || !student) return null;
  const courseKey = String(sch.course || '').trim().toLowerCase();
  const enrs = Array.isArray(student.enrollments) ? student.enrollments : [];
  const enr = courseKey
    ? enrs.find((e) => String(e.courseName || e.course || '').trim().toLowerCase() === courseKey)
    : (enrs.find((e) => e.isPrimary) || enrs[0]);
  const total = Number(enr?.totalSessions ?? student.totalSessions) || 0;
  const completed = Number(enr?.completedSessions ?? student.completedSessions) || 0;
  const next = completed + 1;
  if (next <= 0) return null;
  return total > 0 ? { next, total } : { next, total: null };
};
const fmtDateTimeVN = (input) => {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export default function StudentDetailModal({ studentId, onClose, initialTab, highlightScheduleId }) {
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);
  const { showModal }             = useModal();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab || 'summary'); // 'summary' | 'attendance' | 'finance' | 'academic' | 'edit'
  const [courseFilter, setCourseFilter] = useState('all'); // 'all' | enrollmentId
  const [makeupBusyId, setMakeupBusyId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '', email: '', phone: '', age: '', zalo: '', password: '', gender: 'male',
  });
  /** { [enrollmentId]: { totalSessions, completedSessions, remainingSessions, courseName, isPrimary, status, teacherAlert } } */
  const [enrollmentSessionForms, setEnrollmentSessionForms] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const { updateStudent, assignTeacher, teachers, triggerBackgroundSync, examSubjectsCatalog, currentUser } = useData() || {};
  const canManageStudentAccount = ['admin', 'staff'].includes(String(currentUser?.role || '').toLowerCase())
    || currentUser?.adminRole === 'SUPER_ADMIN'
    || String(currentUser?.id || currentUser?._id || '') === 'admin';
  const [showAddEnrollment, setShowAddEnrollment] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState('');

  useEffect(() => {
    setCourseFilter('all');
    setActiveTab(initialTab || 'summary');
  }, [studentId, initialTab]);

  const handleAdminMakeup = (sch) => {
    const action = getAttendanceAction(sch);
    if (!action.canAdminMakeup || action.state === 'COMPLETED' || action.state === 'CANCELLED') return;
    const sid = sch._id || sch.id;
    const preview = previewMakeupSession(sch, data?.student);
    const buoiPreview = preview
      ? (preview.total != null
        ? ` buổi thứ ${preview.next}/${preview.total}`
        : ` buổi thứ ${preview.next}`)
      : '';
    showModal({
      title: 'Xác nhận điểm danh bù',
      content: `Học viên: ${sch.studentName || data?.student?.name || '—'}\nKhóa học: ${sch.course || '—'}\nGiảng viên: ${sch.teacherName || '—'}\nThời gian: ${sch.startTime || '?'} - ${sch.endTime || '?'}\n\nThao tác này sẽ hoàn thành buổi học và cộng 1 buổi vào tiến độ khóa học${buoiPreview ? ` (${buoiPreview.trim()})` : ''}.`,
      type: 'warning',
      confirmText: 'Xác nhận điểm danh bù',
      onConfirm: async () => {
        setMakeupBusyId(String(sid));
        try {
          const res = await api.schedules.update(sid, {
            status: 'completed',
            adminMakeup: true,
            note: 'Điểm danh bù bởi Admin',
          });
          if (!res?.success) {
            toast.error(res?.message || 'Không thể điểm danh bù');
            return;
          }
          const done = Number(res?.meta?.completedSessions);
          const tot = Number(res?.meta?.totalSessions);
          const buoiDone = Number.isFinite(done) && done > 0
            ? (Number.isFinite(tot) && tot > 0 ? ` buổi thứ ${done}/${tot}` : ` buổi thứ ${done}`)
            : '';
          toast.success(`Đã điểm danh bù${buoiDone} — buổi học hoàn thành`);
          // Cập nhật số buổi trên danh sách Admin/GV ngay (không chờ socket)
          if (res.student && typeof updateStudent === 'function') {
            try {
              const patch = {
                completedSessions: res.student.completedSessions,
                remainingSessions: res.student.remainingSessions,
                totalSessions: res.student.totalSessions,
                enrollments: res.student.enrollments,
                courses: res.student.courses,
                status: res.student.status,
              };
              await updateStudent(res.student._id || studentId, patch, { localOnly: true });
            } catch (_) { /* sync bên dưới sẽ bù */ }
          }
          reloadProfile();
          if (typeof triggerBackgroundSync === 'function') {
            Promise.resolve(triggerBackgroundSync()).catch(() => {});
          }
        } catch (e) {
          toast.error(e?.message || 'Lỗi kết nối');
        } finally {
          setMakeupBusyId(null);
        }
      },
    });
  };

  const handleAdminRejectMakeup = (sch) => {
    const action = getAttendanceAction(sch);
    if (!action.canAdminMakeup || action.state === 'COMPLETED' || action.state === 'CANCELLED') return;
    const sid = sch._id || sch.id;
    showModal({
      title: 'Không tính buổi điểm danh bù',
      content: `Học viên: ${sch.studentName || data?.student?.name || '—'}\nKhóa học: ${sch.course || '—'}\nGiảng viên: ${sch.teacherName || '—'}\nThời gian: ${sch.startTime || '?'} - ${sch.endTime || '?'}\n\nBuổi này sẽ bị hủy, không tính tiến độ/lương. Giảng viên được xếp thêm 1 ca cho học viên.`,
      type: 'warning',
      confirmText: 'Không tính buổi',
      onConfirm: async () => {
        setMakeupBusyId(String(sid));
        try {
          const res = await api.schedules.update(sid, {
            status: 'cancelled',
            rejectMakeup: true,
            cancelReason: 'Admin không tính buổi điểm danh bù — GV được xếp thêm 1 ca',
          });
          if (!res?.success) {
            toast.error(res?.message || 'Không thể từ chối điểm danh bù');
            return;
          }
          toast.success('Đã không tính buổi — giảng viên được xếp thêm 1 ca');
          reloadProfile();
          if (typeof triggerBackgroundSync === 'function') {
            Promise.resolve(triggerBackgroundSync()).catch(() => {});
          }
        } catch (e) {
          toast.error(e?.message || 'Lỗi kết nối');
        } finally {
          setMakeupBusyId(null);
        }
      },
    });
  };
  // Refund/hủy khóa đang chọn → về «Tất cả»
  useEffect(() => {
    if (courseFilter === 'all' || !data?.student) return;
    const list = getClientEnrollments(data.student);
    const enr = list.find((e) => String(e.enrollmentId || e.id) === String(courseFilter));
    if (!enr || isEnrollmentFilterLocked(enr)) {
      setCourseFilter('all');
    }
  }, [data?.student, courseFilter]);

  useEffect(() => {
    if (!data?.student) return;
    if (!hasLearningAccessEnrollment(data.student) && activeTab === 'assignments') {
      setActiveTab('summary');
    }
  }, [data?.student, activeTab]);

  useEffect(() => {
    const s = data?.student;
    if (!s) return;
    setEditForm({
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      age: s.age != null && s.age !== '' ? String(s.age) : '',
      zalo: s.zalo || '',
      password: '',
      gender: s.gender || 'male',
    });
    const list = getClientEnrollments(s);
    const next = {};
    if (list.length) {
      list.forEach((enr, idx) => {
        const id = String(enr.enrollmentId || enr._id || enr.id || `enr-${idx}`);
        const total = Number(enr.totalSessions) > 0 ? Number(enr.totalSessions) : 12;
        const completed = Math.max(0, Number(enr.completedSessions) || 0);
        const remaining = enr.remainingSessions != null && enr.remainingSessions !== ''
          ? Math.max(0, Number(enr.remainingSessions) || 0)
          : Math.max(0, total - completed);
        next[id] = {
          totalSessions: total,
          completedSessions: completed,
          remainingSessions: remaining,
          courseName: enr.courseName || enr.name || `Khóa ${idx + 1}`,
          isPrimary: !!enr.isPrimary,
          status: enr.status || '',
          teacherAlert: String(enr.teacherAlert || '').slice(0, 500),
        };
      });
    } else {
      const total = Number(s.totalSessions) > 0 ? Number(s.totalSessions) : 12;
      const completed = Math.max(0, Number(s.completedSessions) || 0);
      const remaining = s.remainingSessions != null && s.remainingSessions !== ''
        ? Math.max(0, Number(s.remainingSessions) || 0)
        : Math.max(0, total - completed);
      next.main = {
        totalSessions: total,
        completedSessions: completed,
        remainingSessions: remaining,
        courseName: s.course || 'Khóa học',
        isPrimary: true,
        status: s.status || '',
        teacherAlert: String(s.teacherAlert || '').slice(0, 500),
      };
    }
    setEnrollmentSessionForms(next);
  }, [
    data?.student?._id,
    data?.student?.name,
    data?.student?.email,
    data?.student?.phone,
    data?.student?.age,
    data?.student?.zalo,
    data?.student?.gender,
    data?.student?.totalSessions,
    data?.student?.completedSessions,
    data?.student?.remainingSessions,
    data?.student?.enrollments,
    data?.student?.course,
  ]);

  const setEnrollmentSessionField = (enrId, field, rawDigits) => {
    const num = rawDigits === '' ? '' : Number(rawDigits);
    setEnrollmentSessionForms((prev) => {
      const cur = prev[enrId] || { totalSessions: 12, completedSessions: 0, remainingSessions: 12 };
      if (num === '') return { ...prev, [enrId]: { ...cur, [field]: '' } };
      if (field === 'remainingSessions') {
        const t = Math.max(1, Number(cur.totalSessions) || 12);
        const r = Math.max(0, Math.min(t, Number(num) || 0));
        return {
          ...prev,
          [enrId]: { ...cur, totalSessions: t, remainingSessions: r, completedSessions: Math.max(0, t - r) },
        };
      }
      if (field === 'completedSessions') {
        const t = Math.max(1, Number(cur.totalSessions) || 12);
        const c = Math.max(0, Math.min(t, Number(num) || 0));
        return {
          ...prev,
          [enrId]: { ...cur, totalSessions: t, completedSessions: c, remainingSessions: Math.max(0, t - c) },
        };
      }
      const t = Math.max(1, Number(num) || 12);
      const c = Math.max(0, Math.min(t, Number(cur.completedSessions) || 0));
      return {
        ...prev,
        [enrId]: { ...cur, totalSessions: t, completedSessions: c, remainingSessions: Math.max(0, t - c) },
      };
    });
  };

  const reloadProfile = () => {
    if (!studentId) return;
    setLoading(true);
    api.students.getFullDetail(studentId)
      .then((res) => { if (res.success) setData(res.data); })
      .finally(() => setLoading(false));
  };

  const handleSaveEditProfile = async () => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    if (!sid) return;
    if (!String(editForm.name || '').trim() || !String(editForm.phone || '').trim()) {
      toast.error('Vui lòng nhập họ tên và số điện thoại');
      return;
    }
    const payload = {
      name: String(editForm.name || '').trim().toUpperCase(),
      gender: editForm.gender || 'male',
      email: String(editForm.email || '').trim().toLowerCase(),
      phone: String(editForm.phone || '').trim(),
      zalo: String(editForm.zalo || '').trim(),
      age: editForm.age === '' ? '' : Number(String(editForm.age).replace(/\D/g, '') || 0),
    };
    if (String(editForm.password || '').trim()) {
      payload.password = String(editForm.password).trim();
    }

    const sessionEntries = Object.entries(enrollmentSessionForms || {});
    const onlyMain = sessionEntries.length === 1 && sessionEntries[0][0] === 'main';
    if (onlyMain) {
      const sess = sessionEntries[0][1];
      const total = Number(sess.totalSessions) > 0 ? Number(sess.totalSessions) : 12;
      const completed = Math.max(0, Math.min(total, Number(sess.completedSessions) || 0));
      payload.totalSessions = total;
      payload.completedSessions = completed;
      payload.remainingSessions = Math.max(0, total - completed);
      payload.teacherAlert = String(sess.teacherAlert || '').trim().slice(0, 500);
    }

    setSavingEdit(true);
    try {
      const res = await api.students.update(sid, payload);
      if (res?.success === false) {
        toast.error(res?.message || 'Không cập nhật được');
        return;
      }

      if (!onlyMain) {
        for (const [enrId, sess] of sessionEntries) {
          if (!enrId || enrId === 'main') continue;
          const st = String(sess.status || '').toLowerCase();
          if (st === 'cancelled' || st === 'refunded') continue;
          const total = Number(sess.totalSessions) > 0 ? Number(sess.totalSessions) : 12;
          const completed = Math.max(0, Math.min(total, Number(sess.completedSessions) || 0));
          const remaining = Math.max(0, total - completed);
          const enrRes = await api.students.updateEnrollmentSettings(sid, enrId, {
            totalSessions: total,
            completedSessions: completed,
            remainingSessions: remaining,
            teacherAlert: String(sess.teacherAlert || '').trim().slice(0, 500),
          });
          if (enrRes?.success === false) {
            toast.error(enrRes?.message || `Không cập nhật được khóa ${sess.courseName || enrId}`);
            return;
          }
        }
      }

      toast.success('Đã cập nhật thông tin học viên');
      setEditForm((f) => ({ ...f, password: '' }));
      reloadProfile();
      if (updateStudent) {
        try { await updateStudent(sid, payload); } catch { /* ignore sync */ }
      }
    } catch {
      toast.error('Lỗi kết nối khi cập nhật');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAssignEnrollmentTeacher = async (enrollmentId, teacherId) => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    const enrParam = enrollmentId && enrollmentId !== 'main' ? enrollmentId : undefined;
    try {
      await assignTeacher?.(sid, teacherId || null, enrParam);
      reloadProfile();
    } catch { /* ignore */ }
  };

  const handleAddEnrollmentSubmit = async (payload) => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    if (!sid) return false;
    try {
      const res = await api.students.addEnrollment(sid, payload);
      if (res?.success) {
        toast.success(res.message || 'Đã thêm khóa học');
        reloadProfile();
        return true;
      }
      toast.error(res?.message || 'Không thể thêm khóa học');
      return false;
    } catch {
      toast.error('Lỗi kết nối API');
      return false;
    }
  };

  const handlePayEnrollment = (enr) => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    const enrId = enr.enrollmentId || enr.id;
    if (!sid || !enrId || enrId === 'main') {
      toast.error('Không xác định được khóa học để thanh toán');
      return;
    }
    showModal({
      title: 'Xác nhận thanh toán',
      content: `Xác nhận đã thu học phí khóa "${enr.courseName || enr.name}" — ${fmt(enr.price)}?`,
      type: 'question',
      confirmText: 'Đã thu tiền',
      cancelText: 'Hủy',
      onConfirm: async () => {
        const tid = toast.loading('Đang xác nhận thanh toán...');
        try {
          const res = await api.students.payEnrollment(sid, enrId, { paymentMethod: 'cash' });
          toast.dismiss(tid);
          if (res?.success) {
            toast.success(res.message || 'Đã thanh toán');
            reloadProfile();
          } else {
            toast.error(res?.message || 'Thanh toán thất bại');
          }
        } catch {
          toast.dismiss(tid);
          toast.error('Lỗi kết nối API');
        }
      },
    });
  };

  const [cancelEnrModal, setCancelEnrModal] = useState(null); // { enr, reason, refundAmount }
  const [ledgerCard, setLedgerCard] = useState(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    api.finance.studentCard(studentId)
      .then((res) => {
        if (cancelled) return;
        if (res?.success) setLedgerCard(res.data);
        else setLedgerCard(null);
      })
      .catch(() => { if (!cancelled) setLedgerCard(null); });
    return () => { cancelled = true; };
  }, [studentId, data?.student?._id, data?.student?.paidAmount]);


  const handleDeleteEnrollment = (enr) => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    const enrId = enr.enrollmentId || enr._id || enr.id;
    if (!sid || !enrId || enrId === 'main') {
      toast.error('Không xác định được khóa học để hủy');
      return;
    }
    const isPaid = enr.paid === true || enr.paid === 'Đã đóng phí';
    const maxRefund = isPaid ? (Number(enr.price) || 0) : 0;
    // Mặc định hoàn đủ học phí đã đóng — Admin chỉnh tiền hoặc % nếu cần
    setCancelEnrModal({
      enr,
      sid,
      enrId,
      reason: '',
      refundAmount: maxRefund,
      refundPercent: maxRefund > 0 ? 100 : 0,
      maxRefund,
      isPaid,
    });
  };

  const handleConfirmCancelEnrollment = async () => {
    if (!cancelEnrModal) return;
    const { sid, enrId, enr, reason, refundAmount } = cancelEnrModal;
    const tid = toast.loading('Đang hủy khóa...');
    try {
      const res = await api.students.deleteEnrollment(sid, enrId, {
        cancelReason: reason || 'Admin hủy khóa',
        refundAmount: Number(refundAmount) || 0,
      });
      toast.dismiss(tid);
      setCancelEnrModal(null);
      if (res?.success) {
        toast.success(res.message || 'Đã hủy khóa');
        reloadProfile();
      } else {
        toast.error(res?.message || 'Không hủy được khóa');
      }
    } catch {
      toast.dismiss(tid);
      toast.error('Lỗi kết nối API');
    }
  };
  const handleUnlockExams = async () => {
    if (!data.student || !data.student.examProgress || !updateStudent) return;
    const newProgress = data.student.examProgress.map(s => {
      if (s.lockUntil) {
         return { ...s, lockUntil: null };
      }
      return s;
    });
    
    try {
      await updateStudent(data.student._id || data.student.id, { examProgress: newProgress });
      setData({ ...data, student: { ...data.student, examProgress: newProgress } });
      showModal({
        title: 'Thành công',
        content: 'Đã gỡ bỏ đếm ngược 7 ngày! Học viên có thể thi lại ngay.',
        type: 'success'
      });
    } catch (err) {}
  };

  const toggleEnrollmentSetting = async (enr, field) => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    const enrId = enr?.enrollmentId || enr?.id;
    if (!sid || !enrId || enrId === 'main') {
      toast.error('Không xác định được khóa học. Thử tải lại trang.');
      return;
    }
    const curWebcam = enr.requireWebcam === true;
    const curUnlock = enr.examUnlocked === true;
    const payload = field === 'requireWebcam'
      ? { requireWebcam: !curWebcam }
      : { examUnlocked: !curUnlock };
    try {
      const res = await api.students.updateEnrollmentSettings(sid, enrId, payload);
      if (res?.success && res.data) {
        // settings API trả student doc; full-detail bọc trong { student, ... }
        setData((prev) => ({ ...(prev || {}), student: res.data }));
        return;
      }
      toast.error(res?.message || 'Không cập nhật được quyền khóa');
    } catch {
      toast.error('Lỗi kết nối API');
    }
  };

  const patchStudentAccountFields = (sid, fields) => {
    setData((prev) => {
      if (!prev?.student) return prev;
      return { ...prev, student: { ...prev.student, ...fields } };
    });
    if (sid && typeof updateStudent === 'function') {
      updateStudent(sid, fields, { localOnly: true }).catch(() => {});
    }
  };

  const handleResetStudentDevices = () => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    if (!sid) return;
    showModal({
      title: 'Reset thiết bị',
      content: `Xóa danh sách trình duyệt đã ghi của ${data?.student?.name || 'học viên'}? Học viên sẽ gắn lại tối đa 2 trình duyệt trước khi hệ thống báo Admin.`,
      type: 'warning',
      confirmText: 'Reset thiết bị',
      confirmButtonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
      onConfirm: async () => {
        setDeviceBusy('reset');
        try {
          const res = await api.students.resetDevices(sid);
          if (!res?.success) {
            toast.error(res?.message || 'Không reset được thiết bị');
            return;
          }
          patchStudentAccountFields(sid, { knownDeviceCount: 0 });
          toast.success(res.message || 'Đã reset danh sách thiết bị');
        } catch (e) {
          toast.error(e?.message || 'Không reset được thiết bị');
        } finally {
          setDeviceBusy('');
        }
      },
    });
  };

  const handleToggleStudentAccountLock = () => {
    const sid = data?.student?._id || data?.student?.id || studentId;
    if (!sid) return;
    const lockedAcc = !!data?.student?.accountLocked;
    showModal({
      title: lockedAcc ? 'Mở khóa đăng nhập' : 'Khóa đăng nhập',
      content: lockedAcc
        ? `Cho phép ${data?.student?.name || 'học viên'} đăng nhập lại?`
        : `Khóa đăng nhập của ${data?.student?.name || 'học viên'}? Phiên hiện tại sẽ bị đăng xuất ngay.`,
      type: 'warning',
      confirmText: lockedAcc ? 'Mở khóa' : 'Khóa đăng nhập',
      confirmButtonClass: lockedAcc
        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
        : 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
      onConfirm: async () => {
        setDeviceBusy('lock');
        try {
          const res = lockedAcc
            ? await api.students.unlockAccount(sid)
            : await api.students.lockAccount(sid);
          if (!res?.success) {
            toast.error(res?.message || 'Không cập nhật được khóa đăng nhập');
            return;
          }
          patchStudentAccountFields(sid, { accountLocked: !lockedAcc });
          toast.success(res.message || (lockedAcc ? 'Đã mở khóa đăng nhập' : 'Đã khóa đăng nhập'));
        } catch (e) {
          toast.error(e?.message || 'Không cập nhật được khóa đăng nhập');
        } finally {
          setDeviceBusy('');
        }
      },
    });
  };

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api.students.getFullDetail(studentId)
      .then(res => {
        if (res.success) {
          setData(res.data);
        }
      })
      .catch(err => void 0)
      .finally(() => setLoading(false));
  }, [studentId]);

  const [assignments, setAssignments] = useState([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [newAssign, setNewAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });
  const [assignTargetCourse, setAssignTargetCourse] = useState('');
  
  const [studentQuizzes, setStudentQuizzes] = useState([]);
  const [loadingStudentQuizzes, setLoadingStudentQuizzes] = useState(false);

  useEffect(() => {
    if (!studentId || activeTab !== 'academic') return;
    setLoadingStudentQuizzes(true);
    api.quizzes.getAdminQuizzes()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          const sid = String(studentId);
          const list = [];
          res.data.forEach((q) => {
            const sub = (q.submissions || []).find((s) => String(s.studentId?._id || s.studentId) === sid)
              || (q.mySubmission);
            if (sub) {
              list.push({ ...q, mySubmission: sub });
            }
          });
          setStudentQuizzes(list);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStudentQuizzes(false));
  }, [activeTab, studentId]);

  const liveEnrollments = data?.student ? getClientEnrollments(data.student) : [];
  const assignableEnrollments = liveEnrollments.filter((e) => !isEnrollmentFilterLocked(e));
  const liveFilterValid = courseFilter === 'all'
    || liveEnrollments.some((e) => String(e.enrollmentId || e.id) === String(courseFilter)
      && !isEnrollmentFilterLocked(e));
  const liveCourseFilter = liveFilterValid ? courseFilter : 'all';
  const liveActiveEnrollment = liveCourseFilter !== 'all'
    ? liveEnrollments.find((e) => String(e.enrollmentId || e.id) === String(liveCourseFilter)) || null
    : null;
  const liveAssignCourseName = liveActiveEnrollment
    ? (liveActiveEnrollment.courseName || liveActiveEnrollment.name || '')
    : assignTargetCourse;

  useEffect(() => {
    if (liveActiveEnrollment && !isEnrollmentFilterLocked(liveActiveEnrollment)) {
      setAssignTargetCourse(liveActiveEnrollment.courseName || liveActiveEnrollment.name || '');
      return;
    }
    const currentOk = assignableEnrollments.some(
      (e) => String(e.courseName || e.name).trim() === String(assignTargetCourse || '').trim(),
    );
    if (currentOk) return;
    if (assignableEnrollments[0]) {
      setAssignTargetCourse(assignableEnrollments[0].courseName || assignableEnrollments[0].name || '');
    } else {
      setAssignTargetCourse('');
    }
  }, [liveCourseFilter, liveActiveEnrollment?.enrollmentId, liveActiveEnrollment?.id, liveEnrollments.length]);

  const fetchAssignments = async (course) => {
    if (!studentId || !course) {
      setAssignments([]);
      return;
    }
    setLoadingAssign(true);
    try {
      const res = await api.assignments.getByStudentAndCourse(studentId, course);
      const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const want = norm(course);
      const rows = (res.success ? res.data : []) || [];
      setAssignments(rows.filter((a) => !want || norm(a.courseId) === want));
    } catch (err) { void 0; setAssignments([]); }
    finally { setLoadingAssign(false); }
  };

  const fetchAssignmentsForCourses = async (courseNames) => {
    const names = [...new Set((courseNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
    if (!studentId || names.length === 0) {
      setAssignments([]);
      return;
    }
    setLoadingAssign(true);
    try {
      const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const results = await Promise.all(
        names.map((name) => api.assignments.getByStudentAndCourse(studentId, name).catch(() => null)),
      );
      const merged = [];
      const seen = new Set();
      results.forEach((res, idx) => {
        const want = norm(names[idx]);
        (res?.success ? res.data : []).forEach((a) => {
          if (want && norm(a.courseId) !== want) return;
          const id = String(a._id || a.id || '');
          if (!id || seen.has(id)) return;
          seen.add(id);
          merged.push(a);
        });
      });
      merged.sort((a, b) => new Date(b.deadline || b.createdAt || 0) - new Date(a.deadline || a.createdAt || 0));
      setAssignments(merged);
    } catch (err) { void 0; setAssignments([]); }
    finally { setLoadingAssign(false); }
  };

  useEffect(() => {
    if (activeTab !== 'assignments' || !studentId || !data?.student) return;
    if (liveCourseFilter === 'all') {
      fetchAssignmentsForCourses(liveEnrollments.map((e) => e.courseName || e.name));
    } else {
      fetchAssignments(liveActiveEnrollment?.courseName || liveActiveEnrollment?.name || '');
    }
  }, [activeTab, studentId, liveCourseFilter, liveActiveEnrollment?.enrollmentId, liveActiveEnrollment?.id, liveEnrollments.length, data?.student?._id]);

  const handleAddAssignment = async () => {
    const courseName = String(
      liveActiveEnrollment
        ? (liveActiveEnrollment.courseName || liveActiveEnrollment.name)
        : assignTargetCourse,
    ).trim();
    if (!courseName) {
      toast.error('Chọn khóa học để giao bài tập');
      return;
    }
    if (!newAssign.title || !newAssign.deadline) {
      toast.error('Nhập tiêu đề và hạn nộp');
      return;
    }
    const enr = liveEnrollments.find(
      (e) => String(e.courseName || e.name).trim() === courseName && !isEnrollmentFilterLocked(e),
    );
    if (!enr) {
      toast.error('Không thể giao bài cho khóa đã hủy/hoàn');
      return;
    }
    try {
      const res = await api.assignments.create({
        ...newAssign,
        courseId: courseName,
        teacherId: enr?.teacherId || data?.student?.teacherId?._id || data?.student?.teacherId || 'admin',
        studentId: data?.student?._id || data?.student?.id || studentId,
      });
      if (res.success) {
        setShowAddAssign(false);
        setNewAssign({ title: '', deadline: '', fileUrl: '', description: '' });
        toast.success('Đã giao bài tập');
        if (liveCourseFilter === 'all') {
          fetchAssignmentsForCourses(liveEnrollments.map((e) => e.courseName || e.name));
        } else {
          fetchAssignments(courseName);
        }
      } else {
        toast.error(res?.message || 'Không giao được bài tập');
      }
    } catch (err) {
      toast.error('Lỗi kết nối khi giao bài tập');
    }
  };

  if (!studentId) return null;

  const enrollments = data?.student ? getClientEnrollments(data.student) : [];
  const filterIsValid = courseFilter === 'all'
    || enrollments.some((e) => String(e.enrollmentId || e.id) === String(courseFilter)
      && !isEnrollmentFilterLocked(e));
  const effectiveCourseFilter = filterIsValid ? courseFilter : 'all';
  const scopedEnrollments = effectiveCourseFilter === 'all'
    ? enrollments
    : enrollments.filter((e) => String(e.enrollmentId || e.id) === String(effectiveCourseFilter));
  const summaryMetrics = summarizeEnrollments(scopedEnrollments);
  const activeEnrollment = effectiveCourseFilter !== 'all'
    ? enrollments.find((e) => String(e.enrollmentId || e.id) === String(effectiveCourseFilter)) || null
    : null;
  const enrollmentTeacherNames = [...new Set(
    enrollments.map((e) => String(e.teacherName || '').trim()).filter(Boolean),
  )];
  const statusTeacherName = activeEnrollment
    ? (activeEnrollment.teacherName || 'Chưa gán')
    : (enrollmentTeacherNames.length > 0
      ? enrollmentTeacherNames.join(', ')
      : (data?.student?.teacherId?.name
        || data?.student?.teacherName
        || 'Chưa gán'));
  const statusLabel = (() => {
    if (activeEnrollment) {
      if (activeEnrollment.status === 'completed' || activeEnrollment.status === 'Hoàn thành') return 'Hoàn thành';
      if (activeEnrollment.status === 'cancelled' || activeEnrollment.status === 'refunded') return 'Không còn học';
      if (activeEnrollment.status === 'active') return 'Đang học';
      return activeEnrollment.status || data?.student?.status || '—';
    }
    if (!hasLearningAccessEnrollment(data?.student)) return 'Không còn học';
    return data?.student?.status || '—';
  })();
  const avgGradeDisplay = summaryMetrics.avgGrade ?? data?.student?.avgGrade ?? '—';
  const learningTabsLocked = !hasLearningAccessEnrollment(data?.student);
  const invoiceList = Array.isArray(data?.invoices) ? data.invoices : [];
  // Mỗi khóa đã hủy → ẩn đúng 1 hóa đơn thu cũ nhất (giữ HĐ mới nếu đăng ký lại)
  const hidePaymentQuotaByCourse = {};
  scopedEnrollments
    .filter((e) => e?.status === 'cancelled')
    .forEach((e) => {
      const k = courseKeyOf(e.courseName || e.name);
      if (!k) return;
      hidePaymentQuotaByCourse[k] = (hidePaymentQuotaByCourse[k] || 0) + 1;
    });
  const hiddenCancelledPaymentKeys = (() => {
    const skipped = {};
    const hidden = new Set();
    const payments = invoiceList
      .filter((inv) => !isRefundInvoice(inv))
      .slice()
      .sort((a, b) => new Date(a.createdAt || a.ngayXuat || 0) - new Date(b.createdAt || b.ngayXuat || 0));
    payments.forEach((inv) => {
      const k = courseKeyOf(inv.khoaHoc);
      const quota = hidePaymentQuotaByCourse[k] || 0;
      if (!quota) return;
      if ((skipped[k] || 0) >= quota) return;
      hidden.add(String(inv._id || inv.maHoaDon));
      skipped[k] = (skipped[k] || 0) + 1;
    });
    return hidden;
  })();
  const scopeCourseKey = activeEnrollment
    ? courseKeyOf(activeEnrollment.courseName || activeEnrollment.name)
    : '';
  const invoiceInScope = (inv) => {
    if (effectiveCourseFilter === 'all' || !scopeCourseKey) return true;
    return courseKeyOf(inv?.khoaHoc) === scopeCourseKey;
  };

  // Tổng đã thanh toán = cộng tất cả hóa đơn thu (kể cả khóa sau này hủy), không lấy 1 khóa đang theo
  const paymentInvoices = invoiceList.filter((inv) => !isRefundInvoice(inv) && invoiceInScope(inv));
  const refundInvoices = invoiceList.filter((inv) => isRefundInvoice(inv) && invoiceInScope(inv));
  const financePaidFromInvoices = paymentInvoices.reduce((s, inv) => s + (Number(inv.hocPhi) || 0), 0);
  const financeRefundFromInvoices = refundInvoices.reduce((s, inv) => s + Math.abs(Number(inv.hocPhi) || 0), 0);
  // P1: ưu tiên Ledger card TO-BE; fallback invoice/enrollment
  const financeRegisteredFee = ledgerCard
    ? Number(ledgerCard.registeredFee) || 0
    : (scopedEnrollments.reduce((s, e) => s + (Number(e.price) || 0), 0) || Number(data?.student?.price) || 0);
  const isStudentRootPaid = data?.student?.paid === true || data?.student?.paid === 'Đã đóng phí' || data?.student?.paid === 'true';
  const financePaidTotal = ledgerCard
    ? Number(ledgerCard.paidCashIn) || 0
    : (
      scopedEnrollments
        .filter((e) => e?.status !== 'cancelled' && e?.status !== 'refunded' && (isEnrollmentPaid(e) || (e?.isPrimary && isStudentRootPaid)))
        .reduce((s, e) => s + (Number(e.price) || 0), 0)
    );
  const financeListedTotal = ledgerCard
    ? Number(ledgerCard.activeCourseValue) || 0
    : summaryMetrics.price;
  const financeRefundedTotal = ledgerCard
    ? Number(ledgerCard.refundedCashOut) || 0
    : Math.max(financeRefundFromInvoices, summaryMetrics.refundedTotal || 0);
  // Doanh thu thuần = Đã thanh toán − Đã hoàn
  const financeNetCollected = ledgerCard?.netCollected != null
    ? Number(ledgerCard.netCollected) || 0
    : Math.max(0, financePaidTotal - financeRefundedTotal);
  const financeDebt = ledgerCard
    ? Number(ledgerCard.outstanding) || 0
    : Math.max(0, financeListedTotal - (isStudentRootPaid ? financeListedTotal : financeNetCollected));

  const financeAllPaid = summaryMetrics.enrollmentCount > 0
    && summaryMetrics.paidCount >= summaryMetrics.enrollmentCount;
  // Badge header: 0 active → không fallback student.paid («Chưa đóng phí»)
  const learningActiveCount = enrollments.filter(
    (e) => String(e?.status || '').toLowerCase() === 'active',
  ).length;
  const hasRefundSignal = financeRefundedTotal > 0
    || enrollments.some((e) => Number(e?.refundedAmount) > 0 || e?.status === 'refunded');
  const hasCancelledSignal = enrollments.some(
    (e) => e?.status === 'cancelled' || e?.status === 'refunded',
  );
  const headerBadge = (() => {
    if (learningActiveCount === 0 && (hasRefundSignal || hasCancelledSignal)) {
      return {
        label: hasRefundSignal ? 'Đã hoàn' : 'Đã hủy khóa',
        className: 'bg-amber-50 text-amber-800 border border-amber-100',
      };
    }
    if (learningActiveCount > 0) {
      return financeAllPaid
        ? { label: 'Đã thanh toán', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' }
        : { label: 'Chưa đóng phí', className: 'bg-red-50 text-red-600 border border-red-100' };
    }
    // Không active, không hủy/hoàn trong danh sách — giữ paid root nếu có
    if (data?.student?.paid) {
      return { label: 'Đã thanh toán', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
    }
    return { label: 'Chưa đóng phí', className: 'bg-red-50 text-red-600 border border-red-100' };
  })();

  const paidScopedEnrollments = scopedEnrollments.filter(
    (e) => e.status !== 'cancelled' && isEnrollmentPaid(e),
  );
  const financeHistory = (() => {
    const cancelledEnrIds = new Set(
      (scopedEnrollments || [])
        .filter((e) => e?.status === 'cancelled' || e?.status === 'refunded')
        .map((e) => String(e._id || e.enrollmentId || e.id || ''))
        .filter(Boolean),
    );

    // P1: ưu tiên sổ cái Ledger — ẩn PAYMENT của khóa đã hủy; giữ REFUND + TT khóa còn hiệu lực
    if (ledgerCard?.lines?.length) {
      const scoped = ledgerCard.lines.filter((line) => {
        if (effectiveCourseFilter === 'all' || !scopeCourseKey) return true;
        return courseKeyOf(line.courseName) === scopeCourseKey;
      });

      const hidePaymentIds = new Set();
      scoped.forEach((line) => {
        if (line.type === 'refund') return;
        const enrId = String(line.enrollmentId || '').trim();
        if (enrId && cancelledEnrIds.has(enrId)) {
          hidePaymentIds.add(String(line._id));
        }
      });

      // Legacy (không enrollmentId): ẩn đúng N payment cũ nhất / tên khóa đã hủy
      const quota = { ...hidePaymentQuotaByCourse };
      scoped.forEach((line) => {
        if (!hidePaymentIds.has(String(line._id))) return;
        const k = courseKeyOf(line.courseName);
        if (k && quota[k] > 0) quota[k] -= 1;
      });
      scoped
        .filter((line) => {
          if (line.type === 'refund') return false;
          if (hidePaymentIds.has(String(line._id))) return false;
          return !String(line.enrollmentId || '').trim();
        })
        .slice()
        .sort((a, b) => new Date(a.postedAt || a.createdAt || 0) - new Date(b.postedAt || b.createdAt || 0))
        .forEach((line) => {
          const k = courseKeyOf(line.courseName);
          if (!k || !(quota[k] > 0)) return;
          hidePaymentIds.add(String(line._id));
          quota[k] -= 1;
        });

      const rawScoped = scoped.filter((line) => !hidePaymentIds.has(String(line._id)));
      rawScoped.sort((a, b) => new Date(a.postedAt || a.createdAt || 0) - new Date(b.postedAt || b.createdAt || 0));

      let hdCounter = 0;
      let rCounter = 0;

      const mapped = rawScoped.map((line) => {
        const signed = Number(line.signedAmount != null ? line.signedAmount : (line.type === 'refund' ? -line.amount : line.amount)) || 0;
        const isRefund = line.type === 'refund' || signed < 0;

        let code;
        if (isRefund) {
          rCounter += 1;
          // Map về mã HĐ thu gốc (kể cả payment đã ẩn vì khóa hủy)
          code = resolveRefundLinkedInvoiceCode({
            line,
            allLines: ledgerCard.lines,
            invoiceList,
          }) || `HOÀN-${String(rCounter).padStart(4, '0')}`;
        } else {
          hdCounter += 1;
          code = resolveInvoiceDisplayCode({
            maHoaDon: line.maHoaDon,
            sourceRef: line.sourceRef,
          }) || `HĐ-${String(hdCounter).padStart(4, '0')}`;
        }

        return {
          key: String(line._id),
          maHoaDon: code,
          createdAt: line.postedAt || line.createdAt,
          khoaHoc: line.courseName || '—',
          ghiChu: line.note || (isRefund ? 'Hoàn học phí' : 'Thanh toán'),
          hocPhi: signed,
          isRefund,
          synthetic: false,
          ledgerType: line.type,
          enrollmentId: line.enrollmentId ? String(line.enrollmentId) : '',
          paymentMethod: line.metadata?.paymentMethod || line.paymentMethod || data?.student?.paymentMethod || 'transfer',
        };
      });

      return mapped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    const rows = [];

    invoiceList.forEach((inv) => {
      if (!invoiceInScope(inv)) return;
      const isRefund = isRefundInvoice(inv);
      const invKey = String(inv._id || inv.maHoaDon);
      // Khóa đã hủy: chỉ hiện dòng hoàn, ẩn hóa đơn thu gốc tương ứng (không còn badge "Hủy")
      if (!isRefund && hiddenCancelledPaymentKeys.has(invKey)) return;
      const raw = Number(inv.hocPhi) || 0;
      rows.push({
        key: invKey,
        maHoaDon: inv.maHoaDon || '—',
        createdAt: inv.createdAt || inv.ngayXuat,
        khoaHoc: inv.khoaHoc || '—',
        ghiChu: inv.ghiChu || (isRefund ? 'Hoàn học phí' : 'Thu học phí'),
        hocPhi: isRefund ? -Math.abs(raw) : raw,
        isRefund,
        synthetic: !!inv.synthetic,
      });
    });

    // Hủy với hoàn 0đ / chưa có ledger → vẫn 1 dòng hoàn (0đ)
    scopedEnrollments
      .filter((e) => e?.status === 'cancelled')
      .forEach((enr, idx) => {
        const courseName = enr.courseName || enr.name || 'Khóa học';
        const key = courseKeyOf(courseName);
        if (effectiveCourseFilter !== 'all' && scopeCourseKey && key !== scopeCourseKey) return;
        const hasRefundRow = rows.some((r) => r.isRefund && courseKeyOf(r.khoaHoc) === key);
        if (hasRefundRow) return;
        const refundAmt = Number(enr.refundedAmount) || 0;
        const linkedCode = resolveRefundLinkedInvoiceCode({
          line: {
            courseName,
            enrollmentId: enr.enrollmentId || enr.id || enr._id,
            sourceRef: `cancel:x:${enr.enrollmentId || enr.id || enr._id || ''}`,
          },
          allLines: [],
          invoiceList,
        });
        rows.push({
          key: `cancel-refund-${enr.enrollmentId || enr.id || idx}`,
          maHoaDon: linkedCode || '—',
          createdAt: enr.cancelledAt || enr.registeredAt,
          khoaHoc: courseName,
          ghiChu: `Hoàn học phí khi hủy khóa "${courseName}". Lý do: ${String(enr.cancelReason || '').trim() || 'Admin hủy khóa'}`,
          hocPhi: -Math.abs(refundAmt),
          isRefund: true,
          synthetic: true,
        });
      });

    paidScopedEnrollments.forEach((enr, idx) => {
      const courseName = enr.courseName || enr.name || '';
      const amount = Number(enr.price) || 0;
      const matched = rows.some((r) => {
        if (r.isRefund) return false;
        const sameCourse = courseKeyOf(r.khoaHoc) === courseKeyOf(courseName);
        const sameAmount = Math.abs(Number(r.hocPhi) - amount) < 1;
        return sameCourse && sameAmount;
      });
      if (matched) return;
      rows.push({
        key: `enr-${enr.enrollmentId || enr.id || idx}`,
        maHoaDon: '—',
        createdAt: enr.paidAt || enr.registeredAt || data?.student?.paidAt,
        khoaHoc: courseName || 'Khóa học',
        ghiChu: 'Thanh toán khóa học',
        hocPhi: amount,
        isRefund: false,
        synthetic: true,
      });
    });

    rows.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    let hdCounter = 0;
    let rCounter = 0;
    const formattedRows = rows.map((r) => {
      let code;
      if (r.isRefund) {
        rCounter += 1;
        code = resolveRefundLinkedInvoiceCode({
          line: {
            maHoaDon: r.maHoaDon,
            sourceRef: r.sourceRef,
            courseName: r.khoaHoc,
            enrollmentId: r.enrollmentId,
          },
          allLines: [],
          invoiceList,
        }) || (isValidInvoiceDisplayCode(r.maHoaDon) ? String(r.maHoaDon).trim() : null)
          || `HOÀN-${String(rCounter).padStart(4, '0')}`;
      } else {
        hdCounter += 1;
        code = resolveInvoiceDisplayCode({
          maHoaDon: r.maHoaDon,
          sourceRef: r.sourceRef,
        }) || `HĐ-${String(hdCounter).padStart(4, '0')}`;
      }
      return { ...r, maHoaDon: code };
    });

    return formattedRows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hồ sơ học viên"
        className="bg-[#f8fafc] w-full min-w-0 max-w-full sm:max-w-5xl h-[min(96dvh,920px)] sm:h-[90vh] rounded-t-2xl sm:rounded-[24px] shadow-2xl relative z-10 flex flex-col overflow-hidden overflow-x-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 border border-white/20 pb-[env(safe-area-inset-bottom,0px)]"
      >
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-red-600 rounded-lg transform rotate-45 animate-pulse" />
              </div>
            </div>
            <p className="text-sm font-semibold text-indigo-900/50">Đang tải hồ sơ...</p>
          </div>
        ) : !data ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-500 gap-2 p-6">
            <AlertCircle size={40} />
            <p className="font-bold text-center">Lỗi tải dữ liệu. Vui lòng thử lại sau.</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-11 px-6 py-2 bg-slate-200 rounded-xl font-bold text-slate-700">Đóng</button>
          </div>
        ) : (
          <>
            {/* ── HEADER ────────────────────────────────────────────────── */}
            <div
              className="bg-white border-b border-slate-100 px-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5 relative shrink-0"
              style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="absolute z-20 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors shadow-sm"
                style={{
                  top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                  right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
                }}
              >
                <X size={20} />
              </button>

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-5 pr-14">
                <div className="relative shrink-0 mt-1">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white flex items-center justify-center shadow-md border-2 border-white overflow-hidden">
                    <img
                      src={resolveAvatarUrl({ avatar: data.student?.avatar, role: 'student', name: data.student?.name, gender: data.student?.gender })}
                      className="w-full h-full object-cover"
                      alt={data.student?.name || 'avatar'}
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-lg border-2 border-white shadow">
                    <ShieldCheck size={12} />
                  </div>
                </div>

                <div className="flex-1 min-w-0 text-center sm:text-left space-y-2.5 w-full">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight break-words max-w-full">
                      {data.student.name}
                    </h2>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${headerBadge.className}`}>
                      {headerBadge.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-semibold border border-indigo-100 max-w-full whitespace-normal break-words text-left">
                      {data.student.course}
                    </span>
                    {(data.student.courses?.length > 1 || data.student.enrollments?.length > 1) && (
                      <span className="px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg text-[11px] font-semibold border border-sky-100 shrink-0">
                        {enrollments.filter((e) => e.status !== 'cancelled').length || enrollments.length} khóa đang học
                        {enrollments.some((e) => e.status === 'cancelled')
                          ? ` · ${enrollments.filter((e) => e.status === 'cancelled').length} đã hủy`
                          : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] text-slate-600 font-medium">
                    {String(data.student.studentCode || '').trim() ? (
                      <div className="flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                        <Hash size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate font-mono font-semibold text-slate-700">
                          {String(data.student.studentCode).trim()}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                      <Smartphone size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate font-mono">{data.student.phone || data.student.zalo || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                      <Building2 size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">Chi nhánh: {data.student.branchId?.name || data.student.branchId?.code || data.student.branchCode || 'Hệ thống'}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                      <Calendar size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">Đăng ký: {fmtDate(data.student.createdAt)}</span>
                    </div>
                    {data.student.createdByName && (
                      <div className="flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                        <User size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          Người tạo: <strong className="text-slate-700">{data.student.createdByName}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {canManageStudentAccount && (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      {!!data.student.accountLocked && (
                        <span className="px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-100">
                          Đã khóa đăng nhập
                        </span>
                      )}
                      {!data.student.accountLocked && Number(data.student.knownDeviceCount) > 2 && (
                        <span className="px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-100">
                          {Number(data.student.knownDeviceCount)} trình duyệt đã dùng
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleResetStudentDevices}
                        disabled={!!deviceBusy}
                        className="inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {deviceBusy === 'reset' ? <Loader2 size={13} className="animate-spin" /> : <Laptop size={13} />}
                        Reset thiết bị
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleStudentAccountLock}
                        disabled={!!deviceBusy}
                        className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border disabled:opacity-50 ${
                          data.student.accountLocked
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100'
                            : 'text-red-700 bg-red-50 border-red-100 hover:bg-red-100'
                        }`}
                      >
                        {deviceBusy === 'lock'
                          ? <Loader2 size={13} className="animate-spin" />
                          : (data.student.accountLocked ? <Unlock size={13} /> : <Lock size={13} />)}
                        {data.student.accountLocked ? 'Mở khóa đăng nhập' : 'Khóa đăng nhập'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── TABS + Course filter ─────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-100 shrink-0 min-w-0">
              <div className="grid grid-cols-3 lg:flex lg:flex-wrap lg:gap-1 px-1 sm:px-3 lg:px-6">
                {[
                  { id: 'summary', label: 'Tổng quan', icon: ClipboardList },
                  { id: 'attendance', label: 'Lịch học', icon: Clock },
                  { id: 'assignments', label: 'Bài tập', icon: BookOpen, requiresLearning: true },
                  { id: 'finance', label: 'Tài chính', icon: CreditCard },
                  { id: 'academic', label: 'Điểm số', icon: Trophy },
                  { id: 'edit', label: 'Sửa thông tin', icon: Edit3 },
                ].map((tab) => {
                  const locked = !!(tab.requiresLearning && learningTabsLocked);
                  return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => !locked && setActiveTab(tab.id)}
                    disabled={locked}
                    title={locked ? 'Không còn khóa đang học — không thể thao tác học / sửa' : undefined}
                    className={`relative flex flex-col lg:flex-row items-center justify-center gap-0.5 lg:gap-1.5 min-w-0 min-h-11 lg:min-h-12 px-1 lg:px-4 py-1.5 text-[11px] lg:text-[13px] font-semibold text-center leading-tight whitespace-normal lg:whitespace-nowrap transition-colors ${
                      locked
                        ? 'text-slate-300 cursor-not-allowed'
                        : activeTab === tab.id
                          ? 'text-indigo-600'
                          : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <tab.icon size={14} className="shrink-0" />
                    <span className="min-w-0">{tab.label}</span>
                    {activeTab === tab.id && !locked && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-red-600 rounded-full" />
                    )}
                  </button>
                  );
                })}
              </div>
              {enrollments.length > 1 && activeTab !== 'edit' && (
                <div className="px-3 sm:px-6 pb-2.5 pt-0.5 flex justify-stretch sm:justify-end">
                  <div className="w-full sm:w-auto sm:min-w-[220px] sm:max-w-xs">
                    <CmsSelect
                      value={effectiveCourseFilter}
                      onChange={(e) => setCourseFilter(e.target.value)}
                      aria-label="Lọc theo khóa học"
                    >
                      <option value="all">Tất cả khóa học ({enrollments.length})</option>
                      {enrollments.map((enr) => {
                        const id = String(enr.enrollmentId || enr.id);
                        const locked = isEnrollmentFilterLocked(enr);
                        const lockLabel = locked ? enrollmentFilterLockLabel(enr) : '';
                        const name = enr.courseName || enr.name || 'Khóa học';
                        return (
                          <option key={id} value={id} disabled={locked}>
                            {locked && lockLabel ? `${name} (${lockLabel})` : name}
                          </option>
                        );
                      })}
                    </CmsSelect>
                  </div>
                </div>
              )}
            </div>

            {/* ── MAIN CONTENT AREA ─────────────────────────────────────────── */}
            <div className={`flex-1 min-h-0 min-w-0 overflow-x-hidden p-3 sm:p-6 md:p-8 ${activeTab === 'academic' ? 'overflow-y-auto md:overflow-y-hidden' : 'overflow-y-auto'}`}>
              
              {/* --- TAB 1: SUMMARY --- */}
              {activeTab === 'summary' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <StatBox 
                      label="Tiến độ học tập" 
                      value={`${summaryMetrics.progressPercent}%`} 
                      icon={TrendingUp} 
                      color="bg-red-600" 
                      sub={`${summaryMetrics.completedSessions}/${summaryMetrics.totalSessions || 0} buổi`}
                    />
                    <StatBox 
                      label="Số buổi còn lại" 
                      value={summaryMetrics.remainingSessions} 
                      icon={Clock} 
                      color="bg-amber-500" 
                    />
                    <StatBox 
                      label="Học phí gốc" 
                      value={fmtTuition(summaryMetrics.price)} 
                      icon={DollarSign} 
                      color="bg-emerald-600"
                      valueClassName="text-lg sm:text-xl tracking-tight"
                    />
                    <StatBox 
                      label="Điểm trung bình" 
                      value={avgGradeDisplay === 0 || avgGradeDisplay == null || avgGradeDisplay === '' ? '—' : avgGradeDisplay} 
                      icon={Star} 
                      color="bg-violet-500" 
                      sub="Tổng hợp bài tập"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* LEFT: Progress Breakdown */}
                    <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                       <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider mb-6 flex items-center justify-between">
                         Trạng thái đào tạo
                         <ChevronRight size={16} className="text-slate-300" />
                       </h3>
                       <div className="space-y-6">
                          <div>
                             <div className="flex justify-between items-end mb-2">
                               <p className="text-xs font-black text-slate-500 uppercase tracking-tighter">Hoàn thành khóa học</p>
                               <p className="text-xl font-black text-indigo-600">{summaryMetrics.progressPercent}%</p>
                             </div>
                             <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
                                <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-1000 ease-out shadow-lg" 
                                  style={{ width: `${summaryMetrics.progressPercent}%` }}
                                />
                             </div>
                             <p className="mt-2 text-[11px] font-semibold text-slate-400">
                               {summaryMetrics.completedSessions}/{summaryMetrics.totalSessions} buổi
                               {activeEnrollment
                                 ? ` · ${activeEnrollment.courseName || activeEnrollment.name}`
                                 : (enrollments.length > 1 ? ` · ${enrollments.length} khóa` : '')}
                             </p>
                          </div>
                           <div className="grid grid-cols-2 gap-4 pt-4">
                             <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                <p className="text-[10px] font-black text-indigo-900/40 uppercase mb-1">Giảng viên phụ trách</p>
                                <p className="text-sm font-black text-indigo-900">{statusTeacherName}</p>
                             </div>
                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Trạng thái hiện tại</p>
                                <p className="text-sm font-black text-slate-700">{statusLabel}</p>
                             </div>
                          </div>

                          {(() => {
                            const alertRows = (scopedEnrollments || []).filter((e) => {
                              const st = String(e.status || '').toLowerCase();
                              if (st === 'cancelled' || st === 'refunded') return false;
                              return String(e.teacherAlert || '').trim();
                            });
                            return (
                              <div className={`mt-4 rounded-2xl border px-4 py-3 ${
                                alertRows.length ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
                              }`}>
                                <p className={`text-[10px] font-black uppercase tracking-wide mb-1 ${
                                  alertRows.length ? 'text-amber-700' : 'text-slate-400'
                                }`}>
                                  Lưu ý cho giảng viên
                                </p>
                                {alertRows.length === 0 ? (
                                  <p className="text-xs font-medium text-slate-400">
                                    Chưa có lưu ý. Thêm ở tab Sửa thông tin.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {alertRows.map((e) => (
                                      <div key={String(e.enrollmentId || e.id)}>
                                        {(scopedEnrollments.length > 1 || enrollments.length > 1) && (
                                          <p className="text-[11px] font-black text-amber-800/70 mb-0.5">
                                            {e.courseName || e.name}
                                          </p>
                                        )}
                                        <p className="text-sm font-semibold text-amber-950 whitespace-pre-wrap break-words leading-snug">
                                          {String(e.teacherAlert).trim()}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Danh sách khóa học (đa môn) */}
                          {(() => {
                            const enrollments = getClientEnrollments(data.student);
                            if (enrollments.length === 0) return null;
                            const activeTeachers = (teachers || []).filter((t) => String(t.status || '').toLowerCase() === 'active');
                            const studentBranchId = data.student?.branchId;
                            const splitTeachers = (courseOrEnr) => {
                              const matched = [];
                              const other = [];
                              const currentTeacherId = String(courseOrEnr.teacherId || '');
                              const branchId = toBranchId(studentBranchId);
                              for (const t of activeTeachers) {
                                const tid = String(t.id || t._id);
                                const sameBranch = teacherInStudentBranch(t, branchId) || (currentTeacherId && tid === currentTeacherId);
                                if (!sameBranch) {
                                  other.push({ ...t, _branchMismatch: true });
                                  continue;
                                }
                                if (teacherMatchesCourse(t, courseOrEnr, examSubjectsCatalog) || (currentTeacherId && tid === currentTeacherId)) {
                                  matched.push(t);
                                } else {
                                  other.push(t);
                                }
                              }
                              return { matched, other };
                            };
                            const canDelete = enrollments.length > 1;
                            return (
                              <div className="pt-6 mt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-2">
                                    <BookOpen size={14} className="text-indigo-500" /> Các khóa học đang theo
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => setShowAddEnrollment(true)}
                                    className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <Plus size={12} /> Thêm khóa
                                  </button>
                                </div>
                                <div className="space-y-3">
                                  {enrollments.filter(e => !e.cancelledAt && e.status !== 'cancelled' && e.status !== 'refunded').map((enr) => {
                                    const enrId = enr.enrollmentId || enr._id || enr.id;
                                    const isCancelled = enr.status === 'cancelled';
                                    const progress = enr.totalSessions
                                      ? Math.round(((enr.completedSessions || 0) / enr.totalSessions) * 100)
                                      : 0;
                                    const isPaid = enr.paid === true || enr.paid === 'Đã đóng phí';
                                    return (
                                      <div key={enrId} className={`p-4 rounded-2xl border space-y-3 ${isCancelled ? 'border-red-200 bg-red-50/60 opacity-80' : 'border-slate-100 bg-slate-50/50'}`}>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className={`text-sm font-black truncate ${isCancelled ? 'text-red-600 line-through' : 'text-slate-900'}`}>
                                                {enr.courseName || enr.name}
                                              </p>
                                              {enr.isPrimary && !isCancelled && <span className="text-[9px] text-indigo-500 font-black">CHÍNH</span>}
                                              {isCancelled && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-wide border border-red-200">
                                                  ĐÃ HỦY{enr.refundedAmount > 0 ? ` · HOÀN ${Number(enr.refundedAmount).toLocaleString('vi-VN')}Đ` : ''}
                                                </span>
                                              )}
                                            </div>
                                           
                                            {(() => {
                                              if (isCancelled || !isPaid) return null;
                                              const courseName = String(enr.courseName || enr.name || '').trim().toLowerCase();
                                              const amount = Number(enr.price) || 0;
                                              const inv = (invoiceList || []).find((i) => {
                                                const sameCourse = String(i.khoaHoc || '').trim().toLowerCase() === courseName;
                                                const sameAmount = Math.abs(Number(i.hocPhi) - amount) < 1;
                                                const isRefund = String(i.maHoaDon || '').startsWith('R-') || /hoàn/i.test(String(i.ghiChu || ''));
                                                return sameCourse && sameAmount && !isRefund;
                                              });
                                              if (!inv?.maHoaDon) return null;
                                              return (
                                                <p className="text-[10px] font-black text-indigo-600 mt-1">
                                                  Mã HĐ: {inv.maHoaDon}
                                                </p>
                                              );
                                            })()}
                                            {isCancelled ? (
                                              <p className="text-[10px] text-red-500 font-bold mt-1">
                                                Lý do: {String(enr.cancelReason || '').trim() ? enr.cancelReason : 'Admin hủy khóa'} · {enr.cancelledAt ? new Date(enr.cancelledAt).toLocaleDateString('vi-VN') : ''}
                                              </p>
                                            ) : (
                                              <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${
                                                isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                              }`}>
                                                {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                                              </span>
                                            )}
                                          </div>
                                          {!isCancelled && (
                                            <CmsSelect
                                              value={enr.teacherId || ''}
                                              onChange={(e) => handleAssignEnrollmentTeacher(enrId, e.target.value)}
                                              className="sm:w-44 py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                                            >
                                              <option value="">Chưa phân công GV</option>
                                              {(() => {
                                                const { matched, other } = splitTeachers(enr);
                                                const allOptions = [...matched, ...other];
                                                const currentTid = String(enr.teacherId || '');
                                                const currentInList = currentTid && allOptions.some(t => String(t.id || t._id) === currentTid);
                                                return (
                                                  <>
                                                    {/* Nếu GV hiện tại không có trong danh sách (ID không khớp), thêm option fallback */}
                                                    {currentTid && !currentInList && (
                                                      <option value={currentTid}>{enr.teacherName || currentTid}</option>
                                                    )}
                                                    {matched.map((t) => (
                                                      <option key={t.id || t._id} value={String(t.id || t._id)}>{t.name}</option>
                                                    ))}
                                                    {other.map((t) => (
                                                      <option key={t.id || t._id} value={String(t.id || t._id)} disabled>{t._branchMismatch ? `${t.name} (khác chi nhánh)` : `${t.name} (khác môn)`}</option>
                                                    ))}
                                                  </>
                                                );
                                              })()}
                                            </CmsSelect>
                                          )}
                                        </div>
                                        {!isCancelled && (
                                        <div className="flex flex-wrap gap-2">
                                          {!isPaid && enrId !== 'main' && (
                                            <button
                                              type="button"
                                              onClick={() => handlePayEnrollment(enr)}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700"
                                            >
                                              <DollarSign size={12} /> Thanh toán
                                            </button>
                                          )}
                                          {canDelete && enrId !== 'main' && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteEnrollment(enr)}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-wide hover:bg-red-50"
                                            >
                                              <Trash2 size={12} /> Hủy khóa
                                            </button>
                                          )}
                                        </div>
                                        )}
                                        {!isCancelled && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                          {(() => {
                                            const webcamOn = enr.requireWebcam === true;
                                            const unlocked = enr.examUnlocked === true;
                                            return (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => toggleEnrollmentSetting(enr, 'requireWebcam')}
                                                  className={`p-3 rounded-xl border text-left transition-all ${webcamOn ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
                                                >
                                                  <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className={`text-[10px] font-black uppercase tracking-tighter ${webcamOn ? 'text-emerald-700' : 'text-amber-700'}`}>Yêu cầu camera</p>
                                                    <div className={`w-8 h-4 rounded-full flex items-center p-0.5 shrink-0 ${webcamOn ? 'bg-emerald-500' : 'bg-amber-200'}`}>
                                                      <div className={`w-3 h-3 bg-white rounded-full transition-transform ${webcamOn ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                  </div>
                                                  <p className={`text-[9px] font-bold leading-snug ${webcamOn ? 'text-emerald-600/70' : 'text-amber-600/70'}`}>
                                                    {webcamOn ? 'Bắt buộc webcam khi thi khóa này.' : 'Không cần webcam khi thi khóa này.'}
                                                  </p>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => toggleEnrollmentSetting(enr, 'examUnlocked')}
                                                  className={`p-3 rounded-xl border text-left transition-all ${unlocked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}
                                                >
                                                  <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className={`text-[10px] font-black uppercase tracking-tighter ${unlocked ? 'text-emerald-700' : 'text-slate-600'}`}>Mở khóa thi</p>
                                                    <div className={`w-8 h-4 rounded-full flex items-center p-0.5 shrink-0 ${unlocked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                                      <div className={`w-3 h-3 bg-white rounded-full transition-transform ${unlocked ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </div>
                                                  </div>
                                                  <p className={`text-[9px] font-bold leading-snug ${unlocked ? 'text-emerald-600/70' : 'text-slate-500/70'}`}>
                                                    {unlocked ? 'Đã mở. Có thể làm mọi bài thi khóa này.' : 'Đang tắt. Theo lộ trình buổi học.'}
                                                  </p>
                                                </button>
                                              </>
                                            );
                                          })()}
                                        </div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                       </div>
                    </div>

                    {/* RIGHT: Quick Timeline */}
                    <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                       <h3 className="font-black text-white text-sm uppercase tracking-wider mb-6">Nhật ký mới nhất</h3>
                       <div className="space-y-4">
                          {data.schedules?.slice(0, 3).map((sch, i) => (
                            <div key={sch._id} className="flex gap-4 relative">
                              {i < 2 && <div className="absolute left-2.5 top-6 bottom-0 w-px bg-white/10" />}
                              <div className={`w-5 h-5 rounded-full flex-shrink-0 z-10 border-4 border-slate-900 ${
                                sch.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-700'
                              }`} />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black text-emerald-400 uppercase leading-none mb-1">
                                  {fmtDate(sch.date)}
                                  {fmtScheduleTimeRange(sch) ? (
                                    <span className="text-emerald-300/80 font-bold normal-case tracking-normal"> · {fmtScheduleTimeRange(sch)}</span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-slate-300 font-medium truncate">
                                  {sch.title || sch.course}
                                </p>
                              </div>
                            </div>
                          ))}
                          {(!data.schedules || data.schedules.length === 0) && (
                            <p className="text-xs text-slate-500 italic">Chưa có hoạt động nào</p>
                          )}
                       </div>
                       <button 
                        onClick={() => setActiveTab('attendance')}
                        className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-widest border border-white/10"
                       >
                         Xem toàn bộ lịch sử
                       </button>
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 2: ATTENDANCE --- */}
              {activeTab === 'attendance' && (
                <div className="animate-in slide-in-from-right-10 duration-500">
                  <div className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-100">
                    {data.schedules.length === 0 ? (
                      <p className="cms-empty-cell">Chưa có dữ liệu điểm danh</p>
                    ) : (
                      <>
                      <div className="sm:hidden divide-y divide-slate-100">
                        {data.schedules.map((sch) => {
                          const action = getAttendanceAction(sch);
                          const schId = String(sch._id || sch.id || '');
                          const highlighted = highlightScheduleId && schId === String(highlightScheduleId);
                          const canMakeup = action.canAdminMakeup
                            && (action.state === 'OVERDUE_ATTENDANCE' || action.state === 'PENDING_ATTENDANCE');
                          const showCourse = getClientEnrollments(data.student).length > 1;
                          return (
                            <div
                              key={sch._id}
                              className={`p-3.5 space-y-2 ${highlighted ? 'bg-amber-50/80' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800">{fmtDate(sch.date)}</p>
                                  {fmtScheduleTimeRange(sch) ? (
                                    <p className="text-[11px] font-black text-indigo-600 mt-0.5 tabular-nums">
                                      {fmtScheduleTimeRange(sch)}
                                    </p>
                                  ) : null}
                                  <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{sch.teacherName || '—'}</p>
                                  {showCourse ? (
                                    <p className="text-[11px] font-semibold text-blue-600 truncate">{sch.course || '—'}</p>
                                  ) : null}
                                </div>
                                <span className={`shrink-0 inline-flex px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${attendanceToneClass(action.tone)}`}>
                                  {action.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 break-words">{sch.note || sch.subject || 'Dạy thực tế'}</p>
                              {canMakeup && (
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    disabled={makeupBusyId === schId}
                                    onClick={() => handleAdminMakeup(sch)}
                                    className="w-full min-h-10 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {makeupBusyId === schId ? 'Đang xử lý…' : 'Điểm danh bù'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={makeupBusyId === schId}
                                    onClick={() => handleAdminRejectMakeup(sch)}
                                    className="w-full min-h-10 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    Không tính buổi
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden sm:block cms-modal-table-scroll">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-4 sm:px-6 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Ngày / giờ học</th>
                              {(getClientEnrollments(data.student).length > 1) && (
                                <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Khóa học</th>
                              )}
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Giảng viên</th>
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Nội dung</th>
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {data.schedules.map(sch => {
                              const action = getAttendanceAction(sch);
                              const schId = String(sch._id || sch.id || '');
                              const highlighted = highlightScheduleId && schId === String(highlightScheduleId);
                              const canMakeup = action.canAdminMakeup
                                && (action.state === 'OVERDUE_ATTENDANCE' || action.state === 'PENDING_ATTENDANCE');
                              return (
                              <tr
                                key={sch._id}
                                className={`hover:bg-slate-50/50 transition ${highlighted ? 'bg-amber-50/80 ring-1 ring-amber-200' : ''}`}
                              >
                                <td className="px-4 sm:px-6 py-3.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                                  <div className="leading-tight">
                                    <div>{fmtDate(sch.date)}</div>
                                    {fmtScheduleTimeRange(sch) ? (
                                      <div className="text-[11px] font-black text-indigo-600 mt-0.5 tabular-nums">
                                        {fmtScheduleTimeRange(sch)}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                {(getClientEnrollments(data.student).length > 1) && (
                                  <td className="px-3 sm:px-4 py-3.5 text-xs font-bold text-blue-600">{sch.course || '—'}</td>
                                )}
                                <td className="px-3 sm:px-4 py-3.5 text-xs font-semibold text-slate-600">{sch.teacherName || '—'}</td>
                                <td className="px-3 sm:px-4 py-3.5 text-xs text-slate-500 max-w-[180px] break-words">
                                  {formatScheduleNote(sch.note) || sch.subject || 'Dạy thực tế'}
                                </td>
                                <td className="px-3 sm:px-4 py-3.5 text-center">
                                  <div className="inline-flex flex-col items-center gap-1.5">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${attendanceToneClass(action.tone)}`}>
                                      {action.label}
                                    </span>
                                    {canMakeup && (
                                      <div className="flex flex-col items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={makeupBusyId === schId}
                                          onClick={() => handleAdminMakeup(sch)}
                                          className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
                                        >
                                          {makeupBusyId === schId ? 'Đang xử lý…' : 'Điểm danh bù'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={makeupBusyId === schId}
                                          onClick={() => handleAdminRejectMakeup(sch)}
                                          className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                          Không tính buổi
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* --- TAB 3: FINANCE --- */}
              {activeTab === 'finance' && (
                <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                  {/* 5 chỉ tiêu TO-BE (Ledger) */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      { label: 'Tổng học phí đã đăng ký', value: financeRegisteredFee, tone: 'text-slate-800', hint: 'Mọi khóa từng đăng ký' },
                      { label: 'Đã thanh toán', value: financePaidTotal, tone: 'text-emerald-700', hint: 'Chỉ khóa còn hiệu lực' },
                      { label: 'Đã hoàn tiền', value: financeRefundedTotal, tone: 'text-red-600' },
                      { label: 'Doanh thu thuần', value: financeNetCollected, tone: 'text-indigo-700', hint: 'Ledger: Σ TT − Σ Hoàn' },
                      { label: 'Còn phải đóng', value: financeDebt, tone: financeDebt > 0 ? 'text-amber-700' : 'text-slate-800', hint: financeListedTotal > 0 ? `Đang dùng ${fmt(financeListedTotal)}` : '' },
                    ].map((m, idx, arr) => (
                      <div
                        key={m.label}
                        className={`bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-sm min-w-0 ${idx === arr.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}
                      >
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                        <p className={`text-base sm:text-lg font-black break-words ${m.tone}`}>{fmt(m.value)}</p>
                        {m.hint ? <p className="text-[10px] text-slate-400 mt-1 font-semibold">{m.hint}</p> : null}
                      </div>
                    ))}
                  </div>

                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider pt-4">
                    {ledgerCard?.lines?.length ? 'Sổ cái (Ledger)' : 'Lịch sử thanh toán / hóa đơn'}
                  </h3>
                  <div className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
                    {financeHistory.length === 0 ? (
                      <p className="cms-empty-cell">Chưa phát sinh thanh toán nào</p>
                    ) : (
                      <>
                      <div className="sm:hidden divide-y divide-slate-100">
                        {financeHistory.map((inv) => (
                          <div key={inv.key} className="p-3.5 space-y-1.5 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-xs font-black break-all ${inv.synthetic ? 'text-slate-400' : 'text-indigo-600'}`}>
                                {inv.maHoaDon}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0">{fmtDate(inv.createdAt)}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 break-words">
                              {inv.khoaHoc}{inv.ghiChu ? ` — ${inv.ghiChu}` : ''}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {inv.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                            </p>
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm font-black tabular-nums ${inv.isRefund || inv.hocPhi < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                {fmt(inv.hocPhi)}
                              </span>
                              <FinanceDoneBadge inv={inv} enrollments={scopedEnrollments} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden sm:block cms-modal-table-scroll">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-4 sm:px-6 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Mã HĐ</th>
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Ngày</th>
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Nội dung</th>
                              <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Hình thức</th>
                              <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-black text-slate-400 tracking-widest uppercase">Số tiền</th>
                              <th className="px-3 sm:px-4 py-3 text-center text-[11px] font-black text-slate-400 tracking-widest uppercase">Hoàn thành</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {financeHistory.map((inv) => (
                              <tr key={inv.key} className="hover:bg-slate-50/50 transition">
                                <td className="px-4 sm:px-6 py-3.5">
                                  <span className={`text-xs font-black ${inv.synthetic ? 'text-slate-400' : 'text-indigo-600'}`}>
                                    {inv.maHoaDon}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-4 py-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap">{fmtDate(inv.createdAt)}</td>
                                <td className="px-3 sm:px-4 py-3.5 text-xs text-slate-500 max-w-[180px] break-words">
                                  {inv.khoaHoc}{inv.ghiChu ? ` — ${inv.ghiChu}` : ''}
                                </td>
                                <td className="px-3 sm:px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap font-medium">
                                  {inv.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                                </td>
                                <td className={`px-3 sm:px-4 py-3.5 text-right font-black text-sm whitespace-nowrap ${inv.isRefund || inv.hocPhi < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                  {fmt(inv.hocPhi)}
                                </td>
                                <td className="px-3 sm:px-4 py-3.5 text-center">
                                  <FinanceDoneBadge inv={inv} enrollments={scopedEnrollments} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )}
                  </div>
                </div>
              )}
                {/* --- TAB: ASSIGNMENTS --- */}
                {activeTab === 'assignments' && (
                  <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-10 duration-500">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 min-w-0">
                        <BookOpen size={16} className="text-blue-500 shrink-0" />
                        <span className="leading-snug">Danh sách bài tập được giao</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowAddAssign(!showAddAssign)}
                        className="w-full sm:w-auto justify-center bg-red-600 hover:bg-red-700 text-white px-4 py-3 min-h-11 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Plus size={14} /> Giao bài tập mới
                      </button>
                    </div>

                    {showAddAssign && (
                      <div className="bg-white rounded-3xl p-6 border-2 border-indigo-100 shadow-xl space-y-4 animate-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-indigo-50 pb-3 gap-3">
                           <p className="text-xs font-black text-indigo-700 uppercase tracking-widest min-w-0">
                             Thiết lập bài tập
                             {liveAssignCourseName ? (
                               <span className="block sm:inline sm:ml-1 normal-case tracking-normal text-slate-500 font-bold">
                                 ({liveAssignCourseName})
                               </span>
                             ) : null}
                           </p>
                           <button type="button" onClick={() => setShowAddAssign(false)} className="text-slate-400 hover:text-red-500 shrink-0" aria-label="Đóng">
                             <X size={16} />
                           </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {liveCourseFilter === 'all' && assignableEnrollments.length > 0 && (
                            <div className="md:col-span-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Khóa học giao bài</label>
                              <CmsSelect
                                value={assignTargetCourse}
                                onChange={(e) => setAssignTargetCourse(e.target.value)}
                                aria-label="Chọn khóa học giao bài"
                              >
                                {assignableEnrollments.map((enr) => {
                                  const name = enr.courseName || enr.name;
                                  return (
                                    <option key={enr.enrollmentId || enr.id || name} value={name}>
                                      {name}
                                    </option>
                                  );
                                })}
                              </CmsSelect>
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tiêu đề bài tập</label>
                            <input 
                              type="text" value={newAssign.title} 
                              onChange={e => setNewAssign({...newAssign, title: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:border-indigo-500 outline-none"
                              placeholder="VD: Thực hành Excel Buổi 3"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ngày quy định (Deadline)</label>
                            <input 
                              type="date" value={newAssign.deadline} 
                              onChange={e => setNewAssign({...newAssign, deadline: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:border-indigo-500 outline-none"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Link tài liệu / đề bài (File URL)</label>
                            <input 
                              type="text" value={newAssign.fileUrl} 
                              onChange={e => setNewAssign({...newAssign, fileUrl: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:border-indigo-500 outline-none font-mono"
                              placeholder="Dán link file đề bài (Google Drive, v.v...)"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ghi chú hướng dẫn</label>
                            <textarea 
                              value={newAssign.description}
                              onChange={e => setNewAssign({...newAssign, description: e.target.value})}
                              rows={2}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-indigo-500 outline-none resize-none"
                              placeholder="Các yêu cầu cụ thể đối với bài tập này..."
                            />
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={handleAddAssignment}
                          className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition shadow-lg shadow-red-100"
                        >
                          XÁC NHẬN GIAO BÀI
                        </button>
                      </div>
                    )}

                    <div className="bg-white rounded-2xl sm:rounded-[32px] overflow-hidden border border-slate-100 shadow-sm">
                      {loadingAssign ? (
                        <div className="py-16 flex justify-center">
                          <Loader2 className="animate-spin text-indigo-400" />
                        </div>
                      ) : assignments.length === 0 ? (
                        <p className="cms-empty-cell">Chưa có bài tập nào được giao</p>
                      ) : (
                      <>
                      <div className="sm:hidden divide-y divide-slate-100">
                        {assignments.map((a) => {
                          const sub = a.mySubmission;
                          const isLate = new Date() > new Date(a.deadline) && !sub;
                          const role = String(a.assignedByRole || '').toLowerCase();
                          const isAdmin = role === 'admin' || role === 'staff';
                          return (
                            <div key={a._id} className="p-3.5 space-y-2 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight break-words min-w-0">
                                  {a.title}
                                </p>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border ${
                                  isAdmin
                                    ? 'bg-violet-100 text-violet-700 border-violet-200'
                                    : 'bg-sky-100 text-sky-700 border-sky-200'
                                }`}>
                                  {isAdmin ? 'Admin giao' : 'Giáo viên'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold break-words">{a.description || 'Không có mô tả'}</p>
                              {(a.fileUrl || a.attachedFileUrl) && (
                                <a href={(a.fileUrl || a.attachedFileUrl)} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 font-bold inline-flex items-center gap-1 hover:underline">
                                  <Download size={10} /> Tải đề bài
                                </a>
                              )}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className={`text-[11px] font-black ${isLate ? 'text-red-500' : 'text-slate-600'}`}>
                                  Hạn {new Date(a.deadline).toLocaleDateString('vi-VN')}
                                  {isLate ? <span className="ml-1 text-[9px] uppercase">Quá hạn</span> : null}
                                </p>
                                <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                                  sub
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    : isLate ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                }`}>
                                  {sub ? 'Đã nộp' : isLate ? 'Trễ hạn' : 'Chưa nộp'}
                                </span>
                              </div>
                              <p className="text-[11px] font-bold text-slate-500">
                                {sub?.status === 'graded'
                                  ? `Điểm: ${sub.grade}`
                                  : sub
                                    ? 'Chờ chấm'
                                    : 'Chưa có kết quả'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden sm:block cms-modal-table-scroll">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50">
                            <th className="px-4 sm:px-6 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Bài tập</th>
                            <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase">Thời hạn</th>
                            <th className="px-3 sm:px-4 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Tiến độ</th>
                            <th className="px-4 sm:px-6 py-3 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Kết quả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {assignments.map(a => {
                            const sub = a.mySubmission;
                            const isLate = new Date() > new Date(a.deadline) && !sub;
                            return (
                              <tr key={a._id} className="hover:bg-slate-50/50 transition">
                                <td className="px-4 sm:px-6 py-4 min-w-0">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-0.5 flex items-center gap-2 flex-wrap">
                                    <span>{a.title}</span>
                                    {(() => {
                                      const role = String(a.assignedByRole || '').toLowerCase();
                                      const isAdmin = role === 'admin' || role === 'staff';
                                      const label = isAdmin ? 'Admin giao' : 'Giáo viên';
                                      return (
                                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border ${
                                          isAdmin
                                            ? 'bg-violet-100 text-violet-700 border-violet-200'
                                            : 'bg-sky-100 text-sky-700 border-sky-200'
                                        }`}>
                                          {label}
                                        </span>
                                      );
                                    })()}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-bold break-words">{a.description || 'Không có mô tả'}</p>
                                  {(a.fileUrl || a.attachedFileUrl) && (
                                    <a href={(a.fileUrl || a.attachedFileUrl)} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 font-bold flex items-center gap-1 mt-1 hover:underline">
                                      <Download size={10} /> Tải đề bài
                                    </a>
                                  )}
                                  {(a.assignedByRole || a.assignedByName || a.teacherId) && (
                                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                                      Giao bởi: <span className="text-slate-600">
                                        {['admin', 'staff'].includes(String(a.assignedByRole || '').toLowerCase())
                                          ? (a.assignedByName || 'Admin')
                                          : (a.assignedByName || 'Giáo viên')}
                                      </span>
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <p className={`text-[11px] font-black ${isLate ? 'text-red-500' : 'text-slate-600'}`}>
                                    {new Date(a.deadline).toLocaleDateString('vi-VN')}
                                  </p>
                                  {isLate && <span className="text-[9px] font-black text-red-400 uppercase leading-none">Quá hạn</span>}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border ${
                                    sub 
                                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                      : isLate ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                  }`}>
                                    {sub ? 'Đã nộp' : isLate ? 'Trễ hạn' : 'Chưa nộp'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                   {sub?.status === 'graded' ? (
                                      <div className="flex flex-col items-center">
                                         <p className="text-xl font-black text-indigo-600 leading-none">{sub.grade}</p>
                                         <span className="text-[8px] font-black text-indigo-300 uppercase">Đã chấm</span>
                                      </div>
                                   ) : sub ? (
                                      <span className="text-[10px] font-black text-slate-400 uppercase italic">Chờ chấm</span>
                                   ) : (
                                      <span className="text-[10px] font-black text-slate-300 uppercase">—</span>
                                   )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                      </>
                      )}
                    </div>
                  </div>
                )}

              {/* --- TAB 4: ACADEMIC --- */}
              {activeTab === 'academic' && (
                <div className="h-full min-h-0 flex flex-col animate-in slide-in-from-right-10 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 flex-1 min-h-0">
                    {/* Kết quả thi cử */}
                    <div className="flex flex-col min-h-0">
                       <div className="flex items-center justify-between shrink-0 gap-2 flex-wrap">
                         <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 min-w-0">
                           <Trophy size={16} className="text-amber-500 shrink-0" /> <span className="leading-snug">Kết quả thi tốt nghiệp</span>
                         </h3>
                         {(data.student.examProgress || []).some(ep => ep.lockUntil && ep.lockUntil > Date.now()) && (
                           <button onClick={handleUnlockExams} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1">
                             <Clock size={12} /> MỞ KHÓA THI LẠI
                           </button>
                         )}
                       </div>
                       <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pt-2 pr-1 mt-2">
                          {(data.student.examProgress || []).filter(ep => ep.status && ep.status !== 'chua_thi').length === 0 ? (
                            <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 border-dashed text-center">
                               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Học viên chưa tham gia kỳ thi nào</p>
                            </div>
                          ) : (() => {
                              const SL = { coban: 'Máy vi tính (Cơ bản)', word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };
                              return (data.student.examProgress || []).filter(ep => ep.status && ep.status !== 'chua_thi').map(ep => {
                                const tn = ep.tracNghiem || {};
                                const pct = tn.total > 0 ? Math.round(((tn.score || 0) / tn.total) * 100) : 0;
                                const isDat = ep.status === 'dat';
                                const isKhongDat = ep.status === 'khong_dat';
                                return (
                                  <div key={ep.id || ep._id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                                     <div className="flex items-center gap-3 mb-3">
                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDat ? 'bg-emerald-50 text-emerald-500' : isKhongDat ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                           <Trophy size={20} />
                                        </div>
                                        <div>
                                           <p className="text-sm font-black text-slate-800">{SL[ep.id] || ep.id}</p>
                                           <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isDat ? 'bg-emerald-50 text-emerald-600' : isKhongDat ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                                             {isDat ? 'ĐẠT' : isKhongDat ? 'RỚT' : 'ĐANG THI'}
                                           </span>
                                        </div>
                                     </div>
                                     <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                        <div className="bg-slate-50 rounded-xl p-2 sm:p-3 text-center min-w-0">
                                           <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Trắc nghiệm</p>
                                           <p className={`text-lg sm:text-xl font-black break-words ${pct >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>{tn.score || 0}/{tn.total || 15}</p>
                                           <p className="text-[9px] text-slate-400 font-bold">{pct}%</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-2 sm:p-3 text-center min-w-0">
                                           <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Tự luận</p>
                                           <p className="text-sm font-black text-slate-600">{ep.thucHanh === 'da_nop' ? 'Đã nộp' : 'Chưa nộp'}</p>
                                           {ep.essayScore != null && <p className={`text-lg font-black ${ep.essayScore >= 5 ? 'text-emerald-600' : 'text-red-500'}`}>{ep.essayScore}/10</p>}
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-2 sm:p-3 text-center min-w-0">
                                           <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Khóa đến</p>
                                           {ep.lockUntil && ep.lockUntil > Date.now() ? (
                                             <p className="text-xs font-black text-red-500">{new Date(ep.lockUntil).toLocaleDateString('vi-VN')}</p>
                                           ) : (
                                             <p className="text-xs font-bold text-slate-300">—</p>
                                           )}
                                        </div>
                                     </div>
                                  </div>
                                );
                              });
                            })()}
                       </div>
                    </div>

                    {/* Đánh giá bài tập hàng ngày & Trắc nghiệm GV giao */}
                    <div className="flex flex-col min-h-0 space-y-4">
                       <div className="flex flex-col min-h-0">
                         <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 min-w-0 shrink-0">
                           <ClipboardList size={16} className="text-indigo-500 shrink-0" /> <span className="leading-snug">Tiến độ bài tập &amp; Điểm danh</span>
                         </h3>
                         <div className="flex-1 min-h-0 max-h-[35vh] overflow-y-auto overscroll-contain bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3 mt-2">
                            {(!data.student.grades || data.student.grades.length === 0) ? (
                              <p className="text-xs text-slate-400 italic py-4 text-center">Chưa có đánh giá bài tập</p>
                            ) : (
                              data.student.grades.map((g, i) => (
                                <div key={i} className="flex gap-3">
                                   <div className="flex flex-col items-center">
                                      <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-xs font-black text-slate-500">
                                         {g.grade != null ? g.grade : '✓'}
                                      </div>
                                      {i < data.student.grades.length - 1 && <div className="w-px h-full bg-slate-100 my-1" />}
                                   </div>
                                   <div className="flex-1 pb-2">
                                     <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">
                                       {g.date ? fmtDateTimeVN(g.date) : 'Giai đoạn học'}
                                     </p>
                                      <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                                        {formatStudentGradeNote(g)}
                                      </p>
                                   </div>
                                </div>
                              ))
                            )}
                         </div>
                       </div>

                       {/* Trắc nghiệm Giảng viên giao */}
                       <div className="flex flex-col min-h-0">
                         <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 min-w-0 shrink-0">
                           <Award size={16} className="text-red-500 shrink-0" /> <span className="leading-snug">Trắc nghiệm Giảng viên giao</span>
                         </h3>
                         <div className="flex-1 min-h-0 max-h-[35vh] overflow-y-auto overscroll-contain bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3 mt-2">
                           {loadingStudentQuizzes ? (
                             <p className="text-xs text-slate-400 italic py-4 text-center">Đang tải nhật ký trắc nghiệm...</p>
                           ) : studentQuizzes.length === 0 ? (
                             <p className="text-xs text-slate-400 italic py-4 text-center">Chưa có bài trắc nghiệm nào từ Giảng viên</p>
                           ) : (
                             studentQuizzes.map((q) => {
                               const sub = q.mySubmission;
                               const isPassed = sub?.status === 'passed' || (sub?.score != null && sub.score >= 70);
                               return (
                                 <div key={q._id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
                                   <div className="min-w-0 flex-1">
                                     <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                       {q.courseName || 'Bài thi bài học'}
                                     </span>
                                     <h4 className="font-bold text-slate-900 text-xs sm:text-sm mt-1 truncate">{q.title}</h4>
                                     <p className="text-[10px] text-slate-400 font-medium">
                                       Nộp: {sub?.submittedAt ? fmtDateTimeVN(sub.submittedAt) : 'Chưa nộp'}
                                     </p>
                                   </div>
                                   <div className="text-right shrink-0">
                                     {sub ? (
                                       <>
                                         <p className={`text-base font-black ${isPassed ? 'text-emerald-600' : 'text-red-600'}`}>
                                           {sub.correctCount ?? 0}/{sub.totalQuestions ?? 0} câu
                                         </p>
                                         <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                           isPassed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                         }`}>
                                           {sub.score != null ? `${sub.score}%` : (isPassed ? 'ĐẠT' : 'CHƯA ĐẠT')}
                                         </span>
                                       </>
                                     ) : (
                                       <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Chưa làm</span>
                                     )}
                                   </div>
                                 </div>
                               );
                             })
                           )}
                         </div>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB: SỬA THÔNG TIN --- */}
              {activeTab === 'edit' && (
                <div className="max-w-xl mx-auto space-y-5 animate-in slide-in-from-right-10 duration-500">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                      <Edit3 size={16} className="text-indigo-500" /> Sửa thông tin học viên
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Cập nhật hồ sơ và số buổi. Để trống mật khẩu nếu không đổi.</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 space-y-4">
                    <div>
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Họ tên <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold uppercase outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="VD: NGUYỄN VĂN A"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Giới tính chọn ảnh Cartoon <span className="text-red-500">*</span></label>
                      <div className="flex items-center gap-3 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setEditForm(f => ({ ...f, gender: 'male' }))}
                          className={`flex-1 py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                            editForm.gender === 'male' || editForm.gender === 'Nam'
                              ? 'bg-sky-50 text-sky-700 border-sky-300 ring-2 ring-sky-400/20 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>👨 Nam (Cartoon Nam)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditForm(f => ({ ...f, gender: 'female' }))}
                          className={`flex-1 py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                            editForm.gender === 'female' || editForm.gender === 'Nữ'
                              ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-400/20 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>👩 Nữ (Cartoon Nữ)</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="0911222333"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Tuổi</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editForm.age}
                          onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '') }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="VD: 20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Zalo</label>
                      <input
                        type="text"
                        value={editForm.zalo}
                        onChange={(e) => setEditForm((f) => ({ ...f, zalo: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Số Zalo (nếu khác SĐT)"
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-[11px] font-black text-sky-800 uppercase tracking-wide">
                        Số buổi theo từng khóa học
                      </p>
                      {Object.keys(enrollmentSessionForms).length === 0 ? (
                        <p className="text-xs text-slate-400">Chưa có khóa học để chỉnh số buổi.</p>
                      ) : (
                        Object.entries(enrollmentSessionForms).map(([enrId, sess]) => {
                          const cancelled = ['cancelled', 'refunded'].includes(String(sess.status || '').toLowerCase());
                          return (
                            <div
                              key={enrId}
                              className={`rounded-2xl border p-4 space-y-3 ${
                                cancelled
                                  ? 'border-red-100 bg-red-50/50 opacity-70'
                                  : 'border-sky-100 bg-sky-50/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-black text-slate-800">{sess.courseName}</p>
                                {sess.isPrimary && (
                                  <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Chính</span>
                                )}
                                {cancelled && (
                                  <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Đã hủy</span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Tổng buổi</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    disabled={cancelled}
                                    value={sess.totalSessions}
                                    onChange={(e) => setEnrollmentSessionField(enrId, 'totalSessions', e.target.value.replace(/\D/g, ''))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-sky-700 outline-none focus:ring-2 focus:ring-sky-200 bg-white disabled:bg-slate-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Đã học</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    disabled={cancelled}
                                    value={sess.completedSessions}
                                    onChange={(e) => setEnrollmentSessionField(enrId, 'completedSessions', e.target.value.replace(/\D/g, ''))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-amber-700 outline-none focus:ring-2 focus:ring-amber-200 bg-white disabled:bg-slate-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Còn lại</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    disabled={cancelled}
                                    value={sess.remainingSessions}
                                    onChange={(e) => setEnrollmentSessionField(enrId, 'remainingSessions', e.target.value.replace(/\D/g, ''))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-200 bg-white disabled:bg-slate-100"
                                  />
                                </div>
                              </div>
                              {!cancelled && (
                                <div>
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Lưu ý cho giảng viên</label>
                                  <textarea
                                    value={sess.teacherAlert || ''}
                                    maxLength={500}
                                    rows={3}
                                    onChange={(e) => setEnrollmentSessionForms((prev) => ({
                                      ...prev,
                                      [enrId]: { ...prev[enrId], teacherAlert: e.target.value.slice(0, 500) },
                                    }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-200 bg-white resize-y min-h-[4.5rem]"
                                    placeholder="VD: Học chậm, cần ôn Word, học buổi tối..."
                                  />
                                  <p className="text-[11px] text-slate-400 mt-1">GV thấy ngay khi mở hồ sơ khóa này. Không bắt buộc.</p>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      <p className="text-[11px] text-slate-500">Mỗi khóa chỉnh riêng. Đổi một ô sẽ tự khớp hai ô còn lại trong cùng khóa.</p>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide block mb-1">Mật khẩu mới</label>
                      <input
                        type="password"
                        value={editForm.password}
                        onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Để trống nếu không đổi"
                        autoComplete="new-password"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={handleSaveEditProfile}
                      className="w-full min-h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black uppercase tracking-wide inline-flex items-center justify-center gap-2"
                    >
                      {savingEdit ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16} />}
                      Lưu thông tin
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* ── FOOTER ACTIONS ───────────────────────────────────────────── */}
            <div className="bg-white border-t border-slate-100 px-3 py-3 sm:px-6 sm:py-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-2 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => window.open(`https://zalo.me/${data.student.zalo || data.student.phone}`, '_blank', 'noopener,noreferrer')}
                    className="min-h-12 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Nhắn tin Zalo"
                    aria-label="Nhắn tin Zalo"
                  >
                    <ZaloIcon size={18} className="shrink-0" />
                    Nhắn tin
                  </button>
                  
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  {financeDebt > 0 && (
                    <p className="text-[12px] font-semibold text-red-500 flex items-center gap-1 shrink-0">
                      <AlertCircle size={14} /> Còn nợ: {fmt(financeDebt)}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-12 flex-1 sm:flex-none px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[13px] font-bold hover:bg-red-600 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Hoàn tất xem
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showAddEnrollment && data?.student && (
        <AddEnrollmentModal
          student={data.student}
          teachers={teachers || []}
          onSubmit={handleAddEnrollmentSubmit}
          onClose={() => setShowAddEnrollment(false)}
        />
      )}

      {/* ── Dialog HỦY KHÓA ─────────────────────────────────────────── */}
      {cancelEnrModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setCancelEnrModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 border border-red-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Hủy khóa học</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Khóa bị hủy vẫn lưu trong hồ sơ (gạch đỏ)
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-xs font-black text-red-700 uppercase tracking-wide mb-0.5">Khóa học bị hủy</p>
              <p className="text-sm font-bold text-slate-800">{cancelEnrModal.enr.courseName || cancelEnrModal.enr.name}</p>
              {cancelEnrModal.isPaid && (
                <p className="text-xs text-red-600 mt-1">Đã thanh toán: <strong>{Number(cancelEnrModal.enr.price || 0).toLocaleString('vi-VN')}đ</strong></p>
              )}
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">Lý do hủy</label>
                <input
                  type="text"
                  value={cancelEnrModal.reason}
                  onChange={(e) => setCancelEnrModal((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Nhập lý do hủy khóa..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none"
                />
              </div>
              {cancelEnrModal.isPaid && (
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">
                        Số tiền hoàn (tối đa {Number(cancelEnrModal.maxRefund).toLocaleString('vi-VN')}đ)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={cancelEnrModal.maxRefund}
                        step={1000}
                        value={cancelEnrModal.refundAmount}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCancelEnrModal((p) => {
                            const max = Number(p.maxRefund) || 0;
                            const amt = Math.min(Math.max(0, Number(raw) || 0), max);
                            const pct = max > 0 ? Math.round((amt / max) * 1000) / 10 : 0;
                            return { ...p, refundAmount: amt, refundPercent: pct };
                          });
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-red-300 outline-none"
                      />
                    </div>
                    <div className="w-[96px] shrink-0">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">
                        % hoàn
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={cancelEnrModal.refundPercent ?? 0}
                          onChange={(e) => {
                            setCancelEnrModal((p) => {
                              const max = Number(p.maxRefund) || 0;
                              const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                              const amt = Math.min(max, Math.round((max * pct) / 100));
                              return { ...p, refundPercent: pct, refundAmount: amt };
                            });
                          }}
                          className="w-full border border-slate-200 rounded-xl pl-3 pr-7 py-2 text-sm font-semibold focus:ring-2 focus:ring-red-300 outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Mặc định 100%. Đổi tiền hoặc % — hai ô đồng bộ. Nhập 0 nếu không hoàn.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelEnrModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Giữ lại
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelEnrollment}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700"
              >
                {cancelEnrModal.isPaid && cancelEnrModal.refundAmount > 0
                  ? `Hủy & hoàn ${Number(cancelEnrModal.refundAmount).toLocaleString('vi-VN')}đ`
                  : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

{/* Helper UI Components */}
function FinanceDoneBadge({ inv, enrollments }) {
  const pill = (label, tone) => (
    <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-black border ${tone}`}>
      {label}
    </span>
  );
  const ok = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (inv.isRefund || inv.hocPhi < 0) {
    return pill('Hoàn học phí', 'bg-red-100 text-red-700 border-red-200');
  }
  if (!inv.isRefund && Number(inv.hocPhi) > 0) {
    const enrById = inv.enrollmentId
      ? (enrollments || []).find((e) => String(e._id || e.enrollmentId || e.id) === String(inv.enrollmentId))
      : null;
    if (enrById && (enrById.status === 'completed' || enrById.status === 'Hoàn thành')) {
      return pill('Hoàn thành', ok);
    }
    return pill('Đã thanh toán', ok);
  }
  const khoa = String(inv.khoaHoc || '').trim().toLowerCase();
  const enr = (enrollments || []).find((e) => {
    const name = String(e.courseName || e.name || '').trim().toLowerCase();
    return name && name === khoa && e.status !== 'cancelled' && e.status !== 'refunded';
  });
  if (enr && (enr.status === 'completed' || enr.status === 'Hoàn thành')) return pill('Hoàn thành', ok);
  if (enr && isEnrollmentPaid(enr)) return pill('Đã thanh toán', ok);
  if (!enr && inv.synthetic === false) return pill('Đã thanh toán', ok);
  return pill('Chưa thanh toán', 'bg-amber-100 text-amber-700 border-amber-200');
}

function StatBox({ label, value, icon: Icon, color, sub, valueClassName }) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm relative overflow-hidden min-w-0">
       <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
       <div className="flex items-start justify-between gap-3 pl-1 min-w-0">
          <div className="space-y-1 min-w-0 flex-1">
             <p className="text-[11px] font-semibold text-slate-500">{label}</p>
             <h4 className={`text-xl font-bold text-slate-800 break-words leading-tight ${valueClassName || ''}`}>{value}</h4>
             {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white shrink-0`}>
             <Icon size={18} />
          </div>
       </div>
    </div>
  );
}
