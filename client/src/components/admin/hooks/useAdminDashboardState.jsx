import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { useData } from '../../../context/DataContext';
import { useSocket } from '../../../context/SocketContext';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useToast } from '../../../utils/toast.jsx';
import { useBranch } from '../../../context/BranchContext';
import { useModal } from '../../../utils/Modal.jsx';
import api from '../../../services/api';
import { useAdminStudents } from './useAdminStudents';
import { useAdminTeachers } from './useAdminTeachers';
import { EXAM_RESULTS_STUDENTS_FETCH_CAP } from './adminConstants';
import { sumClientPaidTuition } from '../../../utils/enrollments';
import { hasPermission, PERMISSIONS } from '../../../constants/permissions';

export { EXAM_RESULTS_STUDENTS_FETCH_CAP };

const TAB_PERMISSION = {
  students: PERMISSIONS.MANAGE_STUDENTS,
  teachers: PERMISSIONS.VIEW_TEACHERS,
  staff: PERMISSIONS.MANAGE_STAFF,
  hr: PERMISSIONS.MANAGE_HR,
  training: PERMISSIONS.MANAGE_TRAINING,
  'student-training': PERMISSIONS.MANAGE_STUDENT_TRAINING,
  'cert-prep': PERMISSIONS.MANAGE_CERT_PREP,
  evaluations: PERMISSIONS.VIEW_EVALUATIONS,
  finance: PERMISSIONS.MANAGE_FINANCE,
  analytics: PERMISSIONS.VIEW_BRANCH_REVENUE,
  settings: PERMISSIONS.SYSTEM_SETTINGS,
  logs: PERMISSIONS.VIEW_LOGS,
};

/**
 * State + handlers for AdminDashboard.
 * Composes useAdminStudents and useAdminTeachers with shared finance/logs/training state.
 */
export function useAdminDashboardState() {
  const outlet = useOutletContext() || {};
  const {
    teachers: globalTeachers,
    addTeacher: ctxAddTeacher,
    removeTeacher: ctxRemoveTeacher,
    updateTeacher: ctxUpdateTeacher,
    approveTeacher: ctxApproveTeacher,
    manualActivateTeacher: ctxManualActivateTeacher,
    suspendTeacher: ctxSuspendTeacher,
    reactivateTeacher: ctxReactivateTeacher,
    removeStudent: ctxRemoveStudent,
    markStudentPaid,
    transactions,
    getTeacherRating,
    getPrivateEvaluationsForAdmin,
    markEvaluationRead,
    addNotification,
    addSystemLog,
    trainingData,
    addTrainingItem,
    updateTrainingItem,
    removeTrainingItem,
    studentTrainingData,
    addStudentTrainingItem,
    updateStudentTrainingItem,
    removeStudentTrainingItem,
    questions,
    addQuestion,
    addQuestionsBulk,
    updateQuestion,
    removeQuestion,
    resetQuestions,
    replaceTeacherQuestionsForSubject,
    teacherExamTimeLimitMinutes,
    setTeacherExamTimeLimitMinutes,
    studentQuestions,
    addStudentQuestion,
    updateStudentQuestion,
    removeStudentQuestion,
    resetStudentQuestions,
    studentExamMinutes,
    updateStudentExamMinutes,
    studentExamFiles,
    setStudentExamFile,
    grantPending,
    triggerBackgroundSync,
    addExamResult,
    updateExamResult,
    examSubjectsCatalog,
  } = useData();

  const { socket } = useSocket();
  const toast = useToast();
  const { showModal: showGlobalModal } = useModal();
  const { selectedBranchId, branches } = useBranch();
  const safeBranches = (branches || []).filter(Boolean);

  const _sess = outlet.session
    || (() => {
      try {
        return JSON.parse(localStorage.getItem('admin_user') || localStorage.getItem('staff_user') || '{}');
      } catch {
        return {};
      }
    })();
  const isSuperAdmin = _sess?.id === 'admin'
    || _sess?._id === 'admin'
    || _sess?.username === 'admin'
    || _sess?.adminRole === 'SUPER_ADMIN'
    || (_sess?.role === 'admin' && (!_sess?.adminRole || _sess?.adminRole === 'SUPER_ADMIN'));
  const isHighAdmin = _sess?.adminRole === 'HIGH_ADMIN';

  const location = useLocation();
  const navigate = useNavigate();
  const hashRaw = (location.hash || '').replace(/^#/, '');
  const activeTab = (hashRaw.split(/[?#]/)[0] || 'dashboard') || 'dashboard';
  const hashQuery = hashRaw.includes('?') ? hashRaw.slice(hashRaw.indexOf('?') + 1) : '';

  // Chặn mở tab bằng URL hash khi không có quyền (menu đã ẩn nhưng URL vẫn vào được)
  useEffect(() => {
    // Nếu là Staff (không phải SuperAdmin / HighAdmin) chỉ có quyền Hộp thư (manage_messages)
    if (_sess && !isSuperAdmin && !isHighAdmin) {
      const perms = Array.isArray(_sess.permissions) ? _sess.permissions : [];
      const hasOtherPerms = Object.values(TAB_PERMISSION).some((p) => perms.includes(p));
      if (!hasOtherPerms && perms.includes(PERMISSIONS.MANAGE_MESSAGES)) {
        if (location.pathname === '/admin' && (activeTab === 'dashboard' || activeTab === 'overview')) {
          navigate('/admin/inbox', { replace: true });
          return undefined;
        }
      }
    }

    if (activeTab === 'dashboard' || activeTab === 'overview') return undefined;
    // Phân quyền NV: Super luôn vào được; HIGH/STAFF chỉ khi có manage_staff (không dùng hasPermission
    // vì fallback role=admin sẽ mở quá rộng cho HIGH chưa được cấp).
    if (activeTab === 'staff') {
      const perms = Array.isArray(_sess?.permissions) ? _sess.permissions : [];
      const canStaffTab = isSuperAdmin || perms.includes(PERMISSIONS.MANAGE_STAFF);
      if (!canStaffTab) {
        navigate('/admin#dashboard', { replace: true });
        return undefined;
      }
    }
    if (activeTab === 'analytics') {
      const ok = hasPermission(_sess, PERMISSIONS.MANAGE_FINANCE)
        || hasPermission(_sess, PERMISSIONS.VIEW_BRANCH_REVENUE);
      if (!ok) navigate('/admin#dashboard', { replace: true });
      return undefined;
    }
    const need = TAB_PERMISSION[activeTab];
    if (need && !hasPermission(_sess, need)) {
      navigate('/admin#dashboard', { replace: true });
    }
    return undefined;
  }, [activeTab, isSuperAdmin, isHighAdmin, navigate, location.pathname, _sess]);

  const [deleteModal, setDeleteModal] = useState(null);
  const [resetPwModal, setResetPwModal] = useState(null);
  const sTrainingTabRef = useRef('videos');
  const sqSectionRef = useRef('coban');
  const qSectionRef = useRef('coban');

  const studentsApi = useAdminStudents({ activeTab, setDeleteModal, sqSectionRef });
  const teachersApi = useAdminTeachers({
    selectedBranchId,
    activeTab,
    toast,
    search: studentsApi.search,
    setDeleteModal,
    ctxApproveTeacher,
    ctxUpdateTeacher,
    addSystemLog,
    addQuestionsBulk,
    replaceTeacherQuestionsForSubject,
    qSectionRef,
    triggerBackgroundSync,
    getTeacherRating,
  });

  const {
    students,
    studentsPagination,
    fetchStudentsPaginated,
    safeStudentsList,
    filteredStudents,
    search, setSearch,
    filterPaid, setFilterPaid,
    filterCourse, setFilterCourse,
    currentPage, setCurrentPage,
    PAGE_SIZE,
    actionMenuId, setActionMenuId,
    showModal, setShowModal,
    showStudentDetailId, setShowStudentDetailId,
    showImportModal, setShowImportModal,
    enrollmentModalStudent, setEnrollmentModalStudent,
    editStudent, setEditStudent,
    printStudent,
    isExportingExcel,
    sendDebtReminder,
    removeStudent,
    addStudent,
    assignTeacher,
    addEnrollment,
    handlePrintInvoice,
    handleExportExcel,
    handleStudentQuestionsExcelFile,
    studentQuestionsExcelInputRef,
    approveStudentExam,
    revokeStudentExam,
    ctxUpdateStudent,
    refreshStudentsForTab,
    refreshStudentList,
  } = studentsApi;

  // Deep link: /admin#students?studentId=&tab=attendance&scheduleId=
  const [studentDetailTab, setStudentDetailTab] = useState(null);
  const [studentDetailScheduleId, setStudentDetailScheduleId] = useState(null);
  useEffect(() => {
    if (activeTab !== 'students' || !hashQuery) return undefined;
    const params = new URLSearchParams(hashQuery);
    const sid = params.get('studentId');
    if (!sid) return undefined;
    setShowStudentDetailId(sid);
    setStudentDetailTab(params.get('tab') || 'summary');
    setStudentDetailScheduleId(params.get('scheduleId') || null);
    return undefined;
  }, [activeTab, hashQuery, setShowStudentDetailId]);

  const {
    teachers,
    fetchTeachers,
    safeTeachersList,
    safeTeachers,
    filteredTeachers,
    teacherSearch, setTeacherSearch,
    showTeacherModal, setShowTeacherModal,
    teacherForm, setTeacherForm,
    editTeacher, setEditTeacher,
    grantModal, setGrantModal,
    approveModal, setApproveModal,
    reviewModal, setReviewModal,
    payoutModal, setPayoutModal,
    handlePayTeacher,
    handleGoToQR,
    handlePayout,
    handleSaveHoaHongRate,
    approveTeacher,
    markFileReviewed,
    removeTeacher,
    erGvSearch, setErGvSearch,
    erGvForm, setErGvForm,
    BLANK_ER_GV,
    teacherQuestionsExcelInputRef,
    handleTeacherQuestionsExcelFile,
  } = teachersApi;

  // Branch-aware stats (dashboard tab only)
  const statsFetcher = async ([, branch_id]) => {
    const params = branch_id ? { branch_id } : {};
    const res = await api.students.getStats(params);
    return res?.success ? res.data : null;
  };

  const { data: branchStats } = useSWR(
    activeTab === 'dashboard' ? ['admin_stats', selectedBranchId] : null,
    statsFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 15_000 },
  );

  // Finance from server — lấy đủ HV + mọi enrollment (không chỉ khóa chính / page 10)
  const financeFetcher = async ([, branch_id]) => {
    const params = {
      limit: 100,
      page: 1,
      ...(branch_id ? { branch_id } : {}),
    };
    const [resTx, firstPage] = await Promise.all([
      api.transactions.getAll(branch_id ? { branch_id } : {}),
      api.students.getAll(params),
    ]);

    let financeStudents = firstPage?.success ? (firstPage.data || []) : [];
    const totalPages = Number(firstPage?.totalPages) || 1;
    if (firstPage?.success && totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          api.students.getAll({ ...params, page: i + 2 }),
        ),
      );
      rest.forEach((pageRes) => {
        if (pageRes?.success && Array.isArray(pageRes.data)) {
          financeStudents = financeStudents.concat(pageRes.data);
        }
      });
    }

    return {
      financialData: resTx?.success ? (resTx.data || []) : [],
      financeStudents,
    };
  };

  const { data: financeRes, isValidating: isLoadingFinance } = useSWR(
    activeTab === 'finance' ? ['admin_finance_v2', selectedBranchId] : null,
    financeFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 20_000 },
  );

  const financialData = financeRes?.financialData || [];
  const financeStudents = financeRes?.financeStudents || [];

  // Socket: refresh dashboard views when server data changes
  const adminBumpTimerRef = useRef(null);
  useEffect(() => {
    if (!socket) return;

    const runBump = () => {
      mutate(['admin_stats', selectedBranchId]);
      mutate(['admin_finance', selectedBranchId]);
      refreshStudentsForTab();
      if (activeTab === 'teachers') {
        fetchTeachers();
      }
    };

    const bumpAdminViews = () => {
      if (adminBumpTimerRef.current) clearTimeout(adminBumpTimerRef.current);
      adminBumpTimerRef.current = setTimeout(() => {
        adminBumpTimerRef.current = null;
        runBump();
      }, 350);
    };

    const onStudentNew = () => {
      bumpAdminViews();
    };

    const adminRealtimeEvents = [
      'data:refresh', 'student:updated', 'student:assigned', 'student:history_reset',
      'schedule:new', 'schedule:updated', 'schedule:completed', 'schedule:cancelled',
      'transactions:new', 'teacher:financeUpdated', 'tuition:paid', 'revenue:updated',
      'teacher:scored', 'teacher:approved', 'teacher:practical_submitted', 'teacher:rejected', 'teacher:new',
      'assignment:new', 'assignment:graded', 'assignment:submitted', 'assignment:updated', 'assignment:deleted',
      'submission:new', 'submission:graded',
      'exam:unlocked', 'teacher:updated',
      'evaluation:admin_feedback', 'evaluation:teacher_rating',
      'new-notification',
    ];

    socket.on('student:new', onStudentNew);
    adminRealtimeEvents.forEach((ev) => socket.on(ev, bumpAdminViews));

    return () => {
      if (adminBumpTimerRef.current) clearTimeout(adminBumpTimerRef.current);
      socket.off('student:new', onStudentNew);
      adminRealtimeEvents.forEach((ev) => socket.off(ev, bumpAdminViews));
    };
  }, [
    socket,
    activeTab,
    selectedBranchId,
    refreshStudentsForTab,
    fetchTeachers,
    toast,
  ]);

  const handleOpenResetPw = (id, name, role) => {
    setResetPwModal({ id, name, role });
  };

  useEffect(() => {
    const handleResetEvent = (e) => {
      const { userId, userName, role } = e.detail || {};
      if (userId && role) {
        handleOpenResetPw(userId, userName || 'Người dùng', role);
      }
    };
    
    const handleOpenStudentDetail = (e) => {
      const { id, tab, scheduleId } = e.detail || {};
      if (!id) return;
      const safeTab = !tab || tab === 'overview' ? 'summary' : String(tab);
      setStudentDetailTab(safeTab);
      setStudentDetailScheduleId(scheduleId || null);
      setShowStudentDetailId(id);
    };

    window.addEventListener('open-reset-pw', handleResetEvent);
    window.addEventListener('open-student-detail', handleOpenStudentDetail);
    
    return () => {
      window.removeEventListener('open-reset-pw', handleResetEvent);
      window.removeEventListener('open-student-detail', handleOpenStudentDetail);
    };
  }, []);

  // Training management state
  const [trainingTab, setTrainingTab] = useState('videos');
  const [trainingForm, setTrainingForm] = useState(null);
  const [courseBuilderMode, setCourseBuilderMode] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Student training management state
  const [sTrainingTab, setSTrainingTabState] = useState('videos');
  const setSTrainingTab = useCallback((next) => {
    const value = typeof next === 'function' ? next(sTrainingTabRef.current) : next;
    sTrainingTabRef.current = value;
    setSTrainingTabState(value);
  }, []);
  useEffect(() => {
    sTrainingTabRef.current = sTrainingTab;
  }, [sTrainingTab]);

  useEffect(() => {
    if (activeTab !== 'student-training') return;
    fetchStudentsPaginated({
      page: 1,
      limit: EXAM_RESULTS_STUDENTS_FETCH_CAP,
      search: '',
      branch_id: selectedBranchId,
      forceBranchIdAll: selectedBranchId === 'all',
    });
  }, [activeTab, sTrainingTab, selectedBranchId, fetchStudentsPaginated]);

  const [sTrainingForm, setSTrainingForm] = useState(null);
  const [sCourseBuilderMode, setSCourseBuilderMode] = useState(null);
  useEffect(() => {
    if (activeTab !== 'student-training') setSCourseBuilderMode(null);
  }, [activeTab]);

  const [trainingFileUploading, setTrainingFileUploading] = useState(false);
  const [sTrainingFileUploading, setSTrainingFileUploading] = useState(false);

  const formatTrainingFileSize = (bytes) => {
    if (bytes == null || Number.isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extToTrainingFileType = (fileName) => {
    const ext = (fileName.split('.').pop() || '').toUpperCase();
    const map = {
      PDF: 'PDF', DOC: 'DOCX', DOCX: 'DOCX', XLS: 'XLSX', XLSX: 'XLSX',
      PPT: 'PPTX', PPTX: 'PPTX', ZIP: 'ZIP', RAR: 'ZIP',
    };
    return map[ext] || (ext.length <= 5 ? ext : 'FILE');
  };

  const handleTrainingDocUpload = async (e, which) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const setForm = which === 'teacher' ? setTrainingForm : setSTrainingForm;
    const setBusy = which === 'teacher' ? setTrainingFileUploading : setSTrainingFileUploading;
    setBusy(true);
    try {
      const data = await api.settings.uploadTrainingFile(file);
      if (!data.success) throw new Error(data.message || 'Upload thất bại');
      setForm((prev) => ({
        ...prev,
        fileUrl: data.fileUrl,
        fileType: extToTrainingFileType(file.name),
        fileSize: formatTrainingFileSize(file.size),
        fileOriginalName: file.name,
      }));
      toast.success('Đã tải tài liệu lên');
    } catch (err) {
      toast.error(err.message || 'Không tải được file');
    } finally {
      setBusy(false);
    }
  };

  // Teacher question bank filters
  const BLANK_Q = {
    type: 'multiple', section: 'excel', q: '', options: ['', '', '', ''], correct: 0,
    difficulty: 'medium', sampleAnswer: '', imageUrl: '', imageName: '',
    attachedFileUrl: '', attachedFileName: '',
  };
  const [qSearch, setQSearch] = useState('');
  const [qSection, setQSection] = useState('coban');
  const [qDifficulty, setQDifficulty] = useState('all');
  const [qSort, setQSort] = useState('newest');
  const [qForm, setQForm] = useState(null);

  // Student question bank / exam results UI
  const [sqSearch, setSqSearch] = useState('');
  const [sqSection, setSqSection] = useState('coban');
  const [sqType, setSqType] = useState('all');
  const [sqForm, setSqForm] = useState(null);
  const [erSearch, setErSearch] = useState('');

  useEffect(() => {
    sqSectionRef.current = sqSection;
  }, [sqSection]);

  useEffect(() => {
    qSectionRef.current = qSection;
  }, [qSection]);

  const [gradingRow, setGradingRow] = useState(null);
  const [gradingValue, setGradingValue] = useState('');
  const [erForm, setErForm] = useState(null);

  const confirmDelete = async () => {
    if (!deleteModal) return;
    try {
      if (deleteModal.type === 'teacher') {
        await ctxRemoveTeacher(deleteModal.id);
        addSystemLog('Xoá bản ghi', `Giảng viên - ${deleteModal.name}`, 'Admin', 'bg-red-50 text-red-600');
        toast.success(`Đã xoá giảng viên ${deleteModal.name}`);
        fetchTeachers();
      } else {
        await ctxRemoveStudent(deleteModal.id);
        addSystemLog('Xoá bản ghi', `Học viên - ${deleteModal.name}`, 'Admin', 'bg-red-50 text-red-600');
        toast.success(`Đã xoá học viên ${deleteModal.name}`);
        mutate(['admin_stats', selectedBranchId]);
        mutate(['admin_finance', selectedBranchId]);
        refreshStudentList();
      }
    } catch (err) {
      toast.error('Lỗi xoá: ' + (err.message || 'Không xác định'));
    }
    setDeleteModal(null);
  };

  // Stats cards: prefer branch API, fallback to local lists
  const statTotalStudents = branchStats?.total ?? filteredStudents.length;
  const statPaidStudents = branchStats?.paid ?? filteredStudents.filter((s) => s.paid).length;
  const statActiveTeachers = branchStats?.activeTeachers
    ?? safeTeachers.filter((t) => t.status === 'Active' || t.status === 'active').length;
  const statTotalTeachers = branchStats?.totalTeachers
    ?? safeTeachers.length;
  const statTotalRevenue = branchStats?.totalRevenue
    ?? filteredStudents.reduce((sum, s) => sum + sumClientPaidTuition(s), 0);
  const statPendingTeachers = branchStats?.pendingTeachers
    ?? safeTeachers.filter((t) => t.status === 'Pending').length;

  const adminTabValue = useMemo(() => ({
    search, setSearch, filterCourse, setFilterCourse, filterPaid, setFilterPaid,
    handleExportExcel, isExportingExcel, showImportModal, setShowImportModal, showModal, setShowModal,
    studentsPagination, filteredStudents, safeTeachers, safeBranches,
    assignTeacher, addEnrollment, actionMenuId, setActionMenuId, showStudentDetailId, setShowStudentDetailId,
    studentDetailTab, setStudentDetailTab, studentDetailScheduleId, setStudentDetailScheduleId,
    editStudent, setEditStudent,
    enrollmentModalStudent, setEnrollmentModalStudent,
    sendDebtReminder, approveStudentExam, revokeStudentExam, ctxUpdateStudent, toast,
    handlePrintInvoice, removeStudent, currentPage, setCurrentPage,
    refreshStudentList, printStudent, addStudent,
    teachers, globalTeachers, filteredTeachers, teacherSearch, setTeacherSearch, isSuperAdmin, isHighAdmin,
    showTeacherModal, setShowTeacherModal, teacherForm, setTeacherForm, ctxAddTeacher,
    getTeacherRating,
    reviewModal, setReviewModal, grantModal, setGrantModal, approveModal, setApproveModal,
    editTeacher, setEditTeacher, handlePayTeacher, handleGoToQR, handlePayout, handleSaveHoaHongRate,
    payoutModal, setPayoutModal,
    removeTeacher, approveTeacher,
    manualActivateTeacher: ctxManualActivateTeacher,
    suspendTeacher: ctxSuspendTeacher,
    reactivateTeacher: ctxReactivateTeacher,
    fetchTeachers, markFileReviewed, grantPending,
    deleteModal, setDeleteModal, confirmDelete,
    resetPwModal, setResetPwModal, handleOpenResetPw,
    courseBuilderMode, setCourseBuilderMode, trainingData, updateTrainingItem, trainingTab, setTrainingTab,
    trainingForm, setTrainingForm, questions, setErGvForm, BLANK_ER_GV, trainingFileUploading,
    handleTrainingDocUpload, teacherQuestionsExcelInputRef, handleTeacherQuestionsExcelFile,
    addTrainingItem, showGlobalModal, erGvSearch, setErGvSearch, erGvForm, ctxUpdateTeacher,
    qSearch, setQSearch, qSection, setQSection, qDifficulty, setQDifficulty, qSort, qForm, setQForm,
    BLANK_Q, addQuestion, updateQuestion, removeQuestion, resetQuestions,
    setTeacherExamTimeLimitMinutes, teacherExamTimeLimitMinutes, deleteConfirm, setDeleteConfirm, removeTrainingItem,
    safeTeachersList, examSubjectsCatalog,
    getPrivateEvaluationsForAdmin, markEvaluationRead,
    transactions, addSystemLog, financeStudents, isLoadingFinance, markStudentPaid, financialData,
    selectedBranchId,
    
    sCourseBuilderMode, setSCourseBuilderMode, updateStudentTrainingItem,
    studentTrainingData, sTrainingTab, setSTrainingTab, setSTrainingForm,
    students, studentQuestions, studentExamMinutes, updateStudentExamMinutes,
    studentExamFiles, setStudentExamFile,
    resetStudentQuestions, setSqForm, studentQuestionsExcelInputRef, handleStudentQuestionsExcelFile,
    sTrainingForm, sTrainingFileUploading, addStudentTrainingItem,
    erSearch, setErSearch, gradingRow, setGradingRow, gradingValue, setGradingValue,
    addNotification, sqSection, setSqSection, sqType, setSqType, sqSearch, setSqSearch, removeStudentQuestion,
    removeStudentTrainingItem, sqForm, updateStudentQuestion, addStudentQuestion,
    erForm, setErForm, safeStudentsList, updateExamResult, addExamResult,
    fetchStudentsPaginated,
  }), [
    search, filterCourse, filterPaid, handleExportExcel, isExportingExcel, showImportModal, showModal,
    studentsPagination, filteredStudents, safeTeachers, safeBranches,
    assignTeacher, addEnrollment, actionMenuId, enrollmentModalStudent,
    showStudentDetailId, studentDetailTab, studentDetailScheduleId,
    editStudent, printStudent, addStudent,
    sendDebtReminder, approveStudentExam, revokeStudentExam, ctxUpdateStudent, toast,
    handlePrintInvoice, removeStudent, currentPage,
    refreshStudentList,
    teachers, globalTeachers, filteredTeachers, isSuperAdmin, isHighAdmin, getTeacherRating,
    showTeacherModal, teacherForm, ctxAddTeacher,
    reviewModal, grantModal, approveModal, editTeacher, payoutModal,
    handlePayTeacher, handleGoToQR, handlePayout, handleSaveHoaHongRate,
    removeTeacher, approveTeacher, fetchTeachers, markFileReviewed,
    deleteModal, confirmDelete, resetPwModal, selectedBranchId, grantPending, handleOpenResetPw,
    courseBuilderMode, trainingData, updateTrainingItem, trainingTab,
    trainingForm, questions, trainingFileUploading,
    handleTrainingDocUpload, handleTeacherQuestionsExcelFile,
    addTrainingItem, showGlobalModal, erGvSearch, erGvForm, ctxUpdateTeacher,
    qSearch, qSection, qDifficulty, qSort, qForm,
    addQuestion, updateQuestion, removeQuestion, resetQuestions,
    teacherExamTimeLimitMinutes, deleteConfirm, removeTrainingItem,
    safeTeachersList, examSubjectsCatalog,
    getPrivateEvaluationsForAdmin, markEvaluationRead,
    transactions, addSystemLog, financeStudents, isLoadingFinance, markStudentPaid, financialData,
    
    sCourseBuilderMode, updateStudentTrainingItem,
    studentTrainingData, sTrainingTab, setSTrainingTab,
    students, studentQuestions, studentExamMinutes, updateStudentExamMinutes,
    studentExamFiles, setStudentExamFile,
    resetStudentQuestions, handleStudentQuestionsExcelFile,
    sTrainingForm, sTrainingFileUploading, addStudentTrainingItem,
    erSearch, gradingRow, gradingValue,
    addNotification, sqSection, sqType, sqSearch, removeStudentQuestion,
    removeStudentTrainingItem, sqForm, updateStudentQuestion, addStudentQuestion,
    erForm, safeStudentsList, updateExamResult, addExamResult,
    fetchStudentsPaginated,
  ]);

  return {
    activeTab,
    navigate,
    statTotalStudents,
    statPaidStudents,
    statTotalTeachers,
    statActiveTeachers,
    statTotalRevenue,
    statPendingTeachers,
    filteredStudents,
    safeTeachers,
    adminTabValue,
    deleteConfirm,
    setDeleteConfirm,
    removeTrainingItem,
    showModal,
    setShowModal,
    teachers,
    addStudent,
    payoutModal,
    setPayoutModal,
    handleGoToQR,
    handlePayout,
    handleSaveHoaHongRate,
    printStudent,
    showTeacherModal,
    setShowTeacherModal,
    teacherForm,
    setTeacherForm,
    isSuperAdmin,
    isHighAdmin,
    safeBranches,
    ctxAddTeacher,
    toast,
    fetchTeachers,
    editTeacher,
    setEditTeacher,
    examSubjectsCatalog,
    getTeacherRating,
    handleOpenResetPw,
    ctxUpdateTeacher,
    editStudent,
    setEditStudent,
    globalTeachers,
    ctxUpdateStudent,
    selectedBranchId,
    currentPage,
    PAGE_SIZE,
    search,
    filterPaid,
    filterCourse,
    fetchStudentsPaginated,
    grantModal,
    setGrantModal,
    grantPending,
    deleteModal,
    setDeleteModal,
    confirmDelete,
    showStudentDetailId,
    setShowStudentDetailId,
    studentDetailTab,
    studentDetailScheduleId,
    showImportModal,
    setShowImportModal,
    enrollmentModalStudent,
    setEnrollmentModalStudent,
    addEnrollment,
    resetPwModal,
    setResetPwModal,
  };
}
