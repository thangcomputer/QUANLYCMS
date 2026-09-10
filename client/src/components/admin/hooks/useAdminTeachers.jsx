import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { mutate } from 'swr';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { useSocket } from '../../../context/SocketContext';
import { parseQuestionBankExcel } from '../../../utils/studentQuestionsExcel';
import {
  buildTeacherPayoutTransferNote,
  pickFifoPendingSessions,
} from '../../../utils/teacherPayoutNote';

function monthLabelNow(d = new Date()) {
  return `tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

function buildNoteFromPending(pendingSessions, sessionsCount) {
  const picked = pickFifoPendingSessions(pendingSessions, sessionsCount);
  return buildTeacherPayoutTransferNote(picked, { monthLabel: monthLabelNow() });
}
/**
 * Teacher list, payout, approve/review, and teacher-tab UI state.
 */
export function useAdminTeachers({
  selectedBranchId,
  activeTab,
  toast,
  search = '',
  setDeleteModal,
  ctxApproveTeacher,
  ctxUpdateTeacher,
  addSystemLog,
  addQuestionsBulk,
  replaceTeacherQuestionsForSubject,
  qSectionRef,
  triggerBackgroundSync,
  getTeacherRating,
}) {
  const { onDataRefresh } = useSocket();
  const [teachers, setLocalTeachers] = useState([]);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState({
    name: '', phone: '', email: '', specialty: '', subjectIds: [],
    startDate: new Date().toISOString().split('T')[0],
    address: '', voiceRegion: '', branchId: '', branchCode: '',
    baseSalaryPerSession: 150000,
  });
  const [editTeacher, setEditTeacher] = useState(null);
  const [grantModal, setGrantModal] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);
  const [payoutModal, setPayoutModal] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teacherSearch = searchParams.get('teacherSearch') || '';
  const setTeacherSearch = (val) => {
    const next = new URLSearchParams(searchParams);
    if (!val) next.delete('teacherSearch');
    else next.set('teacherSearch', val);
    const qs = next.toString();
    navigate(
      {
        pathname: location.pathname,
        search: qs ? `?${qs}` : '',
        hash: location.hash,
      },
      { replace: true },
    );
  };
  const [erGvSearch, setErGvSearch] = useState('');
  const [erGvForm, setErGvForm] = useState(null);
  const teacherQuestionsExcelInputRef = useRef(null);

  const BLANK_ER_GV = {
    type: 'teacher',
    teacherId: '', teacherName: '',
    subject: 'BÀI TEST GIẢNG VIÊN',
    multipleChoiceCorrect: '', multipleChoiceTotal: '',
    essayScore: '', essayNote: '',
    passed: false, date: new Date().toISOString().split('T')[0],
  };

  const fetchTeachers = useCallback(async () => {
    try {
      const params = selectedBranchId ? { branch_id: selectedBranchId } : {};
      const res = await api.teachers.getAll(params);
      if (res?.success) setLocalTeachers(res.data.map((t) => ({ ...t, id: t._id })));
      else toast?.error?.(res?.message || 'Không tải được danh sách giảng viên');
    } catch (err) {
      toast?.error?.(err.message || 'Không tải được danh sách giảng viên');
    }
  }, [selectedBranchId, toast]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers, activeTab]);

  useEffect(() => {
    if (onDataRefresh && activeTab === 'teachers') {
      return onDataRefresh((payload) => {
        if (
          payload?.type === 'teachers'
          || payload?.type === 'teacher'
          || payload?.type === 'socket:any'
          || payload?.teacherId
          || payload?.status
        ) {
          if (payload?.teacherId && payload?.status) {
            setLocalTeachers((current) => current.map((teacher) => (
              String(teacher.id || teacher._id) === String(payload.teacherId)
                ? {
                  ...teacher,
                  status: payload.status,
                  ...(payload.practicalStatus ? { practicalStatus: payload.practicalStatus } : {}),
                }
                : teacher
            )));
          }
          fetchTeachers();
        }
      });
    }
  }, [onDataRefresh, activeTab, fetchTeachers]);

  const safeTeachersList = useMemo(() => (teachers || []).filter(Boolean), [teachers]);
  const safeTeachers = safeTeachersList;
  const filteredTeachers = safeTeachers.filter((t) =>
    (t.name || '').toLowerCase().includes((teacherSearch || '').toLowerCase())
    || (t.phone || '').toLowerCase().includes((teacherSearch || '').toLowerCase()),
  );

  const handlePayTeacher = async (teacher) => {
    const teacherId = String(teacher.id || teacher._id);
    const rating = typeof getTeacherRating === 'function' ? getTeacherRating(teacherId, teacher) : null;
    const ratingLabel = rating?.count > 0
      ? `Đánh giá HV: ${rating.avg}/5 · ${rating.count} lượt`
      : '';
    setPayoutModal({
      step: 1,
      isLoading: true,
      teacher,
      teacherId,
      teacherName: teacher.name,
      baseSalaryPerSession: teacher.baseSalaryPerSession || 0,
      pendingSessionsCount: 0,
      pendingSessions: [],
      sessionsCount: '',
      amount: '',
      note: '',
      noteTouched: false,
      bankInfo: teacher.bankAccount || {},
      ratingLabel,
      rateDirty: false,
      starBonus: null,
      includeStarBonus: true,
    });
    try {
      const res = await api.teachers.getPendingSessions(teacherId);
      if (res.success) {
        const {
          pendingSessionsCount,
          salaryPerSession,
          bankInfo,
          starBonus,
          pendingSessions = [],
        } = res.data;
        const rate = salaryPerSession || teacher.baseSalaryPerSession || 0;
        const bonusTotal = Number(starBonus?.unpaidBonusTotal) || 0;
        const includeBonus = bonusTotal > 0;
        const autoAmount = pendingSessionsCount * rate + (includeBonus ? bonusTotal : 0);
        const note = buildNoteFromPending(pendingSessions, pendingSessionsCount);
        setPayoutModal((prev) => (prev ? {
          ...prev,
          isLoading: false,
          pendingSessionsCount,
          pendingSessions: Array.isArray(pendingSessions) ? pendingSessions : [],
          baseSalaryPerSession: rate || prev.baseSalaryPerSession,
          sessionsCount: String(pendingSessionsCount),
          amount: String(autoAmount),
          note,
          noteTouched: false,
          bankInfo: bankInfo || prev.bankInfo || {},
          starBonus: starBonus || null,
          includeStarBonus: includeBonus,
        } : null));
      } else {
        setPayoutModal((prev) => (prev ? { ...prev, isLoading: false } : null));
      }
    } catch {
      setPayoutModal((prev) => (prev ? { ...prev, isLoading: false } : null));
    }
  };

  const handleSaveHoaHongRate = async (rate) => {
    if (!payoutModal?.teacherId) return;
    const amount = Math.max(0, Number(rate) || 0);
    try {
      const res = await api.teachers.update(payoutModal.teacherId, { baseSalaryPerSession: amount });
      if (res && res.success === false) throw new Error(res.message || 'Lưu thất bại');
      setPayoutModal((prev) => {
        if (!prev) return null;
        const sessions = Math.max(0, Number(prev.sessionsCount) || 0);
        const bonus = prev.includeStarBonus ? (Number(prev.starBonus?.unpaidBonusTotal) || 0) : 0;
        return {
          ...prev,
          rateDirty: false,
          baseSalaryPerSession: amount,
          amount: String(sessions * amount + bonus),
        };
      });
      toast.success(`Đã lưu lương cứng mặc định: ${amount.toLocaleString('vi-VN')}đ/buổi`);
      fetchTeachers();
    } catch (err) {
      toast.error(err.message || 'Không lưu được lương cứng');
    }
  };

  const handleGoToQR = () => {
    const sessions = Number(payoutModal?.sessionsCount) || 0;
    const bonusOn = !!payoutModal?.includeStarBonus && (Number(payoutModal?.starBonus?.unpaidBonusTotal) || 0) > 0;
    if (sessions <= 0 && !bonusOn) {
      toast.error('Số buổi phải lớn hơn 0 (hoặc bật thưởng sao)');
      return;
    }
    if (!payoutModal?.amount || Number(payoutModal.amount) <= 0) {
      toast.error('Số tiền phải lớn hơn 0');
      return;
    }
    setPayoutModal((prev) => ({ ...prev, step: 2 }));
  };

  const handlePayout = async () => {
    if (!payoutModal?.teacherId) return;
    const loadingId = toast.loading('Đang lưu giao dịch...');
    try {
      const includeStarBonus = !!payoutModal.includeStarBonus
        && (Number(payoutModal.starBonus?.unpaidBonusTotal) || 0) > 0;
      const res = await api.teachers.payFlexible(
        payoutModal.teacherId,
        Number(payoutModal.sessionsCount) || 0,
        Number(payoutModal.amount),
        payoutModal.note,
        {
          includeStarBonus,
          starBonusMonths: includeStarBonus
            ? (payoutModal.starBonus?.unpaidMonths || []).map((m) => m.month)
            : [],
        },
      );
      toast.dismiss(loadingId);
      if (res.success) {
        const { paidSessions, totalAmount, starBonusAmount } = res.data || {};
        const bonusPart = Number(starBonusAmount) > 0
          ? ` (gồm thưởng sao ${Number(starBonusAmount).toLocaleString('vi-VN')}đ)`
          : '';
        toast.success(
          `Thanh toán ${paidSessions || 0} buổi — ${Number(totalAmount).toLocaleString('vi-VN')}đ`
          + ` cho ${payoutModal.teacherName}${bonusPart}`
        );
        setPayoutModal(null);
        mutate(['admin_finance', selectedBranchId]);
        triggerBackgroundSync?.();
      } else {
        toast.error(res.message || 'Thanh toán thất bại');
      }
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error('Lỗi kết nối: ' + (err.message || 'Không rõ nguyên nhân'));
    }
  };

  const approveTeacher = async (id) => {
    await ctxApproveTeacher(id);
    const t = safeTeachersList.find((x) => String(x.id) === String(id));
    if (t) addSystemLog('Phê duyệt Giảng viên', t.name, 'Admin', 'bg-green-50 text-green-600');
    setApproveModal(null);
    fetchTeachers();
  };

  const markFileReviewed = async (id) => {
    try {
      // Chỉ đánh dấu đã xem — kích hoạt giảng dạy qua bước "Cấp quyền giảng dạy"
      await api.teachers.reviewPractical(id);
      toast.success('Đã kiểm tra bài thực hành. Tiếp theo: Cấp quyền giảng dạy.');
      fetchTeachers();
    } catch {
      toast.error('Lỗi khi lưu trạng thái.');
    } finally {
      setReviewModal(null);
    }
  };

  const removeTeacher = (id) => {
    const t = safeTeachersList.find((x) => String(x.id) === String(id));
    setDeleteModal({ type: 'teacher', id, name: t?.name || 'Giảng viên' });
  };

  const handleTeacherQuestionsExcelFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const sectionId = qSectionRef?.current;
    if (!sectionId || sectionId === 'all') {
      toast.error('Chọn phần thi trước khi nhập Excel.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const { questions: imported, errors, skipped } = await parseQuestionBankExcel(evt.target.result);
        if (!imported.length) {
          toast.error(errors[0] || 'Không có câu hỏi hợp lệ trong file.');
          errors.slice(1, 5).forEach((m) => toast.error(m));
          return;
        }
        const normalized = imported.map((q) => ({ ...q, section: sectionId }));
        if (replaceTeacherQuestionsForSubject) {
          replaceTeacherQuestionsForSubject(sectionId, normalized);
        } else {
          addQuestionsBulk(normalized);
        }
        toast.success(
          `Đã nhập ${normalized.length} câu cho phần đã chọn (thay thế câu cũ cùng phần).${skipped ? ` (${skipped} dòng trống)` : ''}`,
        );
        if (errors.length) {
          toast.error(`${errors.length} dòng lỗi: ${errors.slice(0, 2).join(' — ')}${errors.length > 2 ? '…' : ''}`);
        }
      } catch {
        toast.error('Không đọc được file. Dùng mẫu .xlsx Giảng viên và thử lại.');
      }
    };
    reader.readAsBinaryString(file);
  };

  return {
    teachers,
    fetchTeachers,
    safeTeachersList,
    safeTeachers,
    filteredTeachers,
    teacherSearch,
    setTeacherSearch,
    showTeacherModal,
    setShowTeacherModal,
    teacherForm,
    setTeacherForm,
    editTeacher,
    setEditTeacher,
    grantModal,
    setGrantModal,
    approveModal,
    setApproveModal,
    reviewModal,
    setReviewModal,
    payoutModal,
    setPayoutModal,
    handlePayTeacher,
    handleGoToQR,
    handlePayout,
    handleSaveHoaHongRate,
    approveTeacher,
    markFileReviewed,
    removeTeacher,
    erGvSearch,
    setErGvSearch,
    erGvForm,
    setErGvForm,
    BLANK_ER_GV,
    getTeacherRating,
    teacherQuestionsExcelInputRef,
    handleTeacherQuestionsExcelFile,
  };
}