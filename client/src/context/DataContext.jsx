import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { QUESTION_BANK } from '../data/questionBank';
import { playNotifySound } from '../utils/sound';
import api, { API_BASE } from '../services/api';
import { useSocket } from './SocketContext';


// ═══════════════════════════════════════════════════════════════════════════════
// DỮ LIỆU GỐC — Tất cả module đọc/ghi từ đây
// ═══════════════════════════════════════════════════════════════════════════════

const INITIAL_STUDENTS = [];

const INITIAL_TEACHERS = [];

const INITIAL_TRANSACTIONS = [];

// ── LỊCH HỌC — Đồng bộ giữa GV â†” HV ──────────────────────────────────────
const INITIAL_SCHEDULES = [];

const INITIAL_NOTIFICATIONS = [];

const INITIAL_MESSAGES = [];

// ── TÀI LIỆU: Video, Giáo trình, Bài tập ───────────────────────────────────
const INITIAL_MATERIALS = [];

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

const DataContext = createContext(null);

const INITIAL_PRIVATE_EVALUATIONS = [];

// ── One-time Reset: Xóa dữ liệu cũ khi nâng version ────────────────────────
const DATA_VERSION = 'v5_clean_production';
// Helper: đọc từ localStorage, fallback về defaultValue
const loadState = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return defaultValue;
};

export const DataProvider = ({ children, user, onLogout }) => {
  const [currentUser, setCurrentUser] = useState(user || null);

  useEffect(() => {
    setCurrentUser(user);
    if (user) triggerBackgroundSync();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync current user on load
  useEffect(() => {
    const savedUser = localStorage.getItem('thvp_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('[DataContext] Error parsing saved user:', e);
      }
    }
  }, []);

  const [students, setStudents] = useState(() => loadState('thvp_students', INITIAL_STUDENTS));
  const [teachers, setTeachers] = useState(() => loadState('thvp_teachers', INITIAL_TEACHERS));
  const [transactions, setTransactions] = useState(() => loadState('thvp_transactions', INITIAL_TRANSACTIONS));
  const [schedules, setSchedules] = useState(() => loadState('thvp_schedules', INITIAL_SCHEDULES));
  const [messages, setMessages] = useState(() => loadState('thvp_messages', INITIAL_MESSAGES));
  const [materials, setMaterials] = useState(() => loadState('thvp_materials', INITIAL_MATERIALS));
  const [groups, setGroups] = useState(() => loadState('thvp_groups', []));
  const [privateEvaluations, setPrivateEvaluations] = useState(() => loadState('thvp_privateEvaluations', INITIAL_PRIVATE_EVALUATIONS));

  // ── KẾT QUẢ THI (Admin quản lý, chấm điởm HV & GV) ─────────────────────────
  const [examResults, setExamResults] = useState(() => loadState('thvp_examResults', []));

  // ── TRAINING DATA (Admin quản lý, GV xem) ─────────────────────────────────
  const INITIAL_TRAINING = { videos: [], guides: [], files: [] };
  const [trainingData, setTrainingData] = useState(() => loadState('thvp_trainingData', INITIAL_TRAINING));

  // ── STUDENT TRAINING DATA (Admin quản lý, Học viên xem) ─────────────────────────────────
  const [studentTrainingData, setStudentTrainingData] = useState(() => loadState('thvp_studentTrainingData', INITIAL_TRAINING));

  // ── QUESTION BANK (Admin CRUD) ─────────────────────────────────────────────
  const [questions, setQuestions] = useState(() => loadState('thvp_questions', QUESTION_BANK));
  const [studentQuestions, setStudentQuestions] = useState(() => loadState('thvp_studentQuestions', []));

  // ── SOCKET LISTENERS (Global Data Sync) ───────────────────────────────────
  const { 
    onGroupNew, onRecallReceive, onReactionReceive, onDataRefresh, onMessageReceive,
    notifications: socketNotifications, setNotifications: setSocketNotifications,
    socket,
  } = useSocket();

  // 🔐 COOLDOWN REAL-TIME SYNC: Lắng nghe sự kiện attendance:locked từ server
  // Khi GV hoặc Admin điểm danh, tất cả client sẽ nhận được sự kiện này
  // và cập nhật trạng thái can_check_in = false cho học viên được điểm danh
  useEffect(() => {
    if (!socket) return;
    const handleAttendanceLocked = (data) => {
      console.log('[SOCKET] attendance:locked received:', data);
      setStudents(prev => prev.map(s => {
        const sid = String(s._id || s.id);
        if (sid === String(data.studentId)) {
          return {
            ...s,
            can_check_in: false,
            remaining_cooldown_hours: 12,
            last_attendance_at: data.attendedAt,
          };
        }
        return s;
      }));
    };
    socket.on('attendance:locked', handleAttendanceLocked);
    return () => {
      socket.off('attendance:locked', handleAttendanceLocked);
    };
  }, [socket]);

  useEffect(() => {
    let unsubGroup, unsubRecall, unsubMsg;

    if (onGroupNew) {
      unsubGroup = onGroupNew((newGroup) => {
        setGroups(prev => {
          if (prev.some(g => g._id === newGroup._id)) return prev;
          return [newGroup, ...prev];
        });
      });
    }
    
    if (onRecallReceive) {
      unsubRecall = onRecallReceive((data) => {
        setMessages(prev => prev.map(m =>
          String(m.id) === String(data.messageId) ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' } : m
        ));
      });
    }

    if (onMessageReceive) {
      unsubMsg = onMessageReceive((data) => {
        setMessages(prev => {
          if (prev.some(m => String(m.id) === String(data._id))) return prev;
          return [...prev, {
            id: data._id,
            convId: data.conversationId,
            senderId: data.senderId,
            senderName: data.senderName,
            senderRole: data.senderRole,
            receiverId: data.receiverId,
            content: data.content,
            time: new Date(data.createdAt || Date.now()),
            read: data.isRead || false,
            isGroup: data.isGroup || false,
            groupId: data.groupId,
            isRecalled: data.isRecalled || false,
            messageType: data.messageType || 'text',
            fileName: data.fileName,
            fileUrl: data.fileUrl,
            reactions: data.reactions || []
          }];
        });
      });
    }

    return () => {
      if (unsubGroup) unsubGroup();
      if (unsubRecall) unsubRecall();
      if (unsubMsg) unsubMsg();
    };
  }, [onGroupNew, onRecallReceive, onMessageReceive]);

  // ── SYSTEM LOGS ─────────────────────────────────────────────────────────────
  const [systemLogs, setSystemLogs] = useState(() => loadState('thvp_systemLogs', []));

  // ── Persist tất cả state vào localStorage ──────────────────────────────────
  useEffect(() => { localStorage.setItem('thvp_students', JSON.stringify(students)); }, [students]);
  useEffect(() => { localStorage.setItem('thvp_teachers', JSON.stringify(teachers)); }, [teachers]);
  useEffect(() => { localStorage.setItem('thvp_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('thvp_schedules', JSON.stringify(schedules)); }, [schedules]);
  useEffect(() => { localStorage.setItem('thvp_messages', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem('thvp_materials', JSON.stringify(materials)); }, [materials]);
  useEffect(() => { localStorage.setItem('thvp_groups', JSON.stringify(groups)); }, [groups]);
  useEffect(() => { localStorage.setItem('thvp_privateEvaluations', JSON.stringify(privateEvaluations)); }, [privateEvaluations]);
  useEffect(() => { localStorage.setItem('thvp_trainingData', JSON.stringify(trainingData)); }, [trainingData]);
  useEffect(() => { localStorage.setItem('thvp_studentTrainingData', JSON.stringify(studentTrainingData)); }, [studentTrainingData]);
  useEffect(() => { localStorage.setItem('thvp_questions', JSON.stringify(questions)); }, [questions]);
  useEffect(() => { localStorage.setItem('thvp_studentQuestions', JSON.stringify(studentQuestions)); }, [studentQuestions]);
  useEffect(() => { localStorage.setItem('thvp_systemLogs', JSON.stringify(systemLogs)); }, [systemLogs]);
  useEffect(() => { localStorage.setItem('thvp_examResults', JSON.stringify(examResults)); }, [examResults]);

  const [isRefetching, setIsRefetching] = useState(false);

  // ── PHÂN TRANG HỌC VIÊN (Server-side Pagination cho Admin) ──────────────────
  const [studentsPagination, setStudentsPagination] = useState({
    totalRecords: 0, totalPages: 1, currentPage: 1,
  });

  const fetchStudentsPaginated = useCallback(async ({ page = 1, limit = 10, search = '', paid, course, branch_id } = {}) => {
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (paid !== undefined && paid !== 'all') params.paid = paid === 'paid' ? 'true' : 'false';
      if (course && course !== 'all') params.course = course;
      if (branch_id && branch_id !== 'all') params.branch_id = branch_id;
      const res = await api.students.getAll(params);
      if (res?.success) {
        setStudents(res.data.map(s => ({ ...s, id: s._id })));
        setStudentsPagination({
          totalRecords: res.totalRecords || 0,
          totalPages: res.totalPages || 1,
          currentPage: res.currentPage || 1,
        });
      }
      return res;
    } catch (err) {
      console.error('[DataContext] fetchStudentsPaginated error:', err);
    }
  }, []);

  const triggerBackgroundSync = useCallback(async () => {
    if (!currentUser) return;
    // HV/GV phải có token mới sync, Tránh gọi bị 401 khi chưa login xong
    if (currentUser.role !== 'admin' && !localStorage.getItem(`${currentUser.role}_access_token`)) return;
    
    setIsRefetching(true);
    try {
      const isTeacher = currentUser.role === 'teacher';
      const isStudent = currentUser.role === 'student';
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'staff';  // ⭐ Staff cũng cần fetch teachers/transactions

      const promises = [];
      
      if (isAdmin) {
        // Admin: students handled by fetchStudentsPaginated, skip here
        promises.push(api.schedules.getAll().catch(() => ({ success: false })));
      } else if (isTeacher) {
        // Teacher: cần tất cả học viên đã gán — truyền limit cao
        promises.push(api.students.getAll({ limit: 1000 }).catch(() => ({ success: false })));
        promises.push(api.schedules.getAll().catch(() => ({ success: false })));
      }

      if (isAdmin) {
        promises.push(api.teachers.getAll().catch(() => ({ success: false })));
        promises.push(api.transactions.getAll().catch(() => ({ success: false })));
        promises.push(api.examResults.getAll().catch(() => ({ success: false })));
      } else if (isTeacher) {
        promises.push(api.transactions.getByTeacher(currentUser.id).catch(() => ({ success: false })));
        promises.push(api.teachers.getById(currentUser.id || currentUser._id).catch(() => ({ success: false })));
      }

      if (isStudent) {
        promises.push(api.students.getById(currentUser.id || currentUser._id).catch(() => ({ success: false })));
        promises.push(api.schedules.getByStudent(currentUser.id || currentUser._id).catch(() => ({ success: false })));
      }

      // Handle Groups (everyone except student has groups at this index)
      // Actually everyone needs groups
      promises.push(api.messages.getGroups(currentUser.id || currentUser._id).catch(() => ({ success: false })));

      const results = await Promise.all(promises);
      let idx = 0;

      if (isAdmin) {
        const schedulesRes = results[idx++];
        if (schedulesRes?.success) setSchedules(schedulesRes.data.map(sch => ({
          ...sch,
          id: sch._id,
          studentId: typeof sch.studentId === 'object' && sch.studentId ? String(sch.studentId._id || sch.studentId) : String(sch.studentId || ''),
          teacherId: typeof sch.teacherId === 'object' && sch.teacherId ? String(sch.teacherId._id || sch.teacherId) : String(sch.teacherId || ''),
        })));
      } else if (isTeacher) {
        const studentsRes = results[idx++];
        if (studentsRes?.success) setStudents(studentsRes.data.map(s => ({ ...s, id: s._id })));
        const schedulesRes = results[idx++];
        if (schedulesRes?.success) setSchedules(schedulesRes.data.map(sch => ({
          ...sch,
          id: sch._id,
          studentId: typeof sch.studentId === 'object' && sch.studentId ? String(sch.studentId._id || sch.studentId) : String(sch.studentId || ''),
          teacherId: typeof sch.teacherId === 'object' && sch.teacherId ? String(sch.teacherId._id || sch.teacherId) : String(sch.teacherId || ''),
        })));
      }

      if (isAdmin) {
        const teachersRes = results[idx++];
        if (teachersRes?.success) setTeachers(teachersRes.data.map(t => ({ ...t, id: t._id })));
        const transactionsRes = results[idx++];
        if (transactionsRes?.success) setTransactions(transactionsRes.data.map(tx => ({ ...tx, id: tx._id })));
        const examResultsRes = results[idx++];
        if (Array.isArray(examResultsRes)) setExamResults(examResultsRes.map(r => ({ ...r, id: r._id || r.id })));
      } else if (isTeacher) {
        const transactionsRes = results[idx++];
        if (transactionsRes?.success) setTransactions(transactionsRes.data.map(tx => ({ ...tx, id: tx._id })));
        const teacherSelfRes = results[idx++];
        if (teacherSelfRes?.success) setTeachers([{ ...teacherSelfRes.data, id: teacherSelfRes.data._id }]);
      }

      if (isStudent) {
        const studentRes = results[idx++];
        if (studentRes?.success) setStudents([ { ...studentRes.data, id: studentRes.data._id } ]);
        const schedulesRes = results[idx++];
        if (schedulesRes?.success) setSchedules(schedulesRes.data.map(sch => ({
          ...sch,
          id: sch._id,
          studentId: typeof sch.studentId === 'object' && sch.studentId ? String(sch.studentId._id || sch.studentId) : String(sch.studentId || ''),
          teacherId: typeof sch.teacherId === 'object' && sch.teacherId ? String(sch.teacherId._id || sch.teacherId) : String(sch.teacherId || ''),
        })));
      }

      // Groups are always the last one (except if results ended early, but idx++ handles it)
      const groupsRes = results[idx++];
      if (groupsRes?.success) setGroups(groupsRes.data || []);
    } catch (e) {
      if (e.status === 401 && onLogout) {
        onLogout();
      }
      console.error('[SYNC] DataContext auto-sync err:', e);
    } finally {
      setTimeout(() => setIsRefetching(false), 500);
    }
  }, [currentUser, onLogout]);

  // ── BACKGROUND SYNC NGẦM (Multi-tab & Window Focus) ────────────────────────
  useEffect(() => {
    const handleStorage = (e) => {
      // Tự động đồng bộ ngay lập tức nếu tab khác thay đổi dữ liệu phụ
      if (e.key === 'thvp_transactions') setTransactions(JSON.parse(e.newValue || '[]'));
    };

    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        triggerBackgroundSync();
      }
    };

    // Lắng nghe sự kiện force refresh
    if (onDataRefresh) {
      onDataRefresh(() => {
        triggerBackgroundSync();
      });
    }

    // 1. Tự động load ngầm ngay khi vừa mở web
    handleSync();

    // 2. Chạy ngầm định kỳ mỗi 1 phút đở auto-load (Polling)
    const interval = setInterval(() => {
      handleSync();
    }, 60000);

    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [triggerBackgroundSync, onDataRefresh]);
  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────

  const addNotification = useCallback((userId, role, text, type = 'system', path = null) => {
    playNotifySound();
    setSocketNotifications(prev => [{
      id: Date.now(), userId, role, message: text, // Map to bell's expected 'message' key
      time: new Date().toISOString(), read: false, type, path,
      title: type === 'SYSTEM' ? 'Thông báo hệ thống' : 'Thông báo'
    }, ...prev]);
  }, [setSocketNotifications]);

  const markNotificationRead = useCallback((notifId) => {
    setSocketNotifications(prev => prev.map(n => (n.id === notifId || n._id === notifId) ? { ...n, read: true } : n));
  }, [setSocketNotifications]);

  const getNotifications = useCallback((userId, role) => {
    return (socketNotifications || []).filter(n =>
      (n.userId === userId || n.userId === null) && (n.role === role || n.role === null)
    );
  }, [socketNotifications]);

  // ── ADMIN ACTIONS ──────────────────────────────────────────────────────────

  const addStudent = useCallback(async (student) => {
    const payload = {
      name:          student.name,
      age:           student.age || undefined,
      phone:         student.phone || '',
      zalo:          student.zalo || student.phone || '',
      address:       student.address || '',
      course:        student.course,
      price:         student.price || 0,
      totalSessions: student.totalSessions || 12,
      paid:          !!student.paid,
      notes:         student.notes || '',
      linkHoc:       student.linkHoc || '',
      teacherId:     student.teacherId || null,
      learningMode:  student.learningMode || 'OFFLINE',
      branchId:      student.branchId || undefined,
    };

    try {
      const res = await api.students.create(payload);
      if (res?.success && res.data) {
        const saved = { ...res.data, id: res.data._id };
        setStudents(prev => [...prev, saved]);
        return saved;
      } else {
        console.error('[addStudent] API failed:', res?.message);
        throw new Error(res?.message || 'Lỗi từ máy chủ khi thêm học viên');
      }
    } catch (err) {
      console.error('[addStudent] Error:', err);
      throw err;
    }
  }, []);

  const addTeacher = useCallback(async (teacher) => {
    const payload = {
      name:      teacher.name,
      phone:     teacher.phone,
      specialty: teacher.specialty || '',
      password:  teacher.password || teacher.phone,
      status:    teacher.status || 'pending',
      branchId:   teacher.branchId || undefined,
      branchCode: teacher.branchCode || undefined,
    };

    try {
      const res = await api.teachers.create(payload);
      if (res?.success && res.data) {
        const saved = { ...res.data, id: res.data._id };
        setTeachers(prev => [...prev, saved]);
        return saved;
      } else {
        console.error('[addTeacher] API failed:', res?.message);
        throw new Error(res?.message || 'Lỗi từ máy chủ khi thêm giảng viên');
      }
    } catch (err) {
      console.error('[addTeacher] Error:', err);
      throw err;
    }
  }, []);


  // Cấp quyền chờ duyệt (Inactive/Locked → Pending): GV đăng nhập được, chỉ thi được
  const grantPending = useCallback(async (teacherId) => {
    const resetData = {
      status: 'Pending',
      testScore: 0,
      testStatus: null,
      testDate: null,
      practicalFile: null,
      practicalStatus: 'none',
      lockReason: null,
    };
    // Update local state
    setTeachers(prev => prev.map(t =>
      String(t.id) === String(teacherId) || String(t._id) === String(teacherId)
        ? { ...t, ...resetData }
        : t
    ));
    // Sync to MongoDB
    try {
      await api.teachers.update(teacherId, resetData);
      console.log('[grantPending] Synced to DB for teacher:', teacherId);
    } catch (err) {
      console.error('[grantPending] API error:', err);
    }
  }, []);

  const removeTeacher = useCallback(async (teacherId) => {
    try {
      const res = await api.teachers.remove(teacherId);
      if (res?.success) {
        setTeachers(prev => prev.filter(t => String(t.id) !== String(teacherId) && String(t._id) !== String(teacherId)));
        setStudents(prev => prev.map(s => String(typeof s.teacherId === 'object' && s.teacherId !== null ? s.teacherId._id || s.teacherId.id : s.teacherId) === String(teacherId) ? { ...s, teacherId: null, teacherName: null } : s));
        return true;
      } else {
        console.error('[removeTeacher] API failed:', res?.message);
        throw new Error(res?.message || 'Xoá thất bại');
      }
    } catch (err) {
      console.error('[removeTeacher] Error:', err);
      throw err;
    }
  }, []);

  const updateTeacher = useCallback(async (teacherId, updates) => {
    setTeachers(prev => prev.map(t => String(t.id) === String(teacherId) ? { ...t, ...updates } : t));
    try {
      const res = await api.teachers?.update(teacherId, updates);
      if (res && res.success === false) throw new Error(res.message);
      triggerBackgroundSync();
      return res;
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [triggerBackgroundSync]);

  const updateStudent = useCallback(async (studentId, updates) => {
    setStudents(prev => prev.map(s => String(s.id) === String(studentId) ? { ...s, ...updates } : s));
    try {
      const res = await api.students?.update(studentId, updates);
      if (res && res.success === false) throw new Error(res.message);
      triggerBackgroundSync();
      return res;
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [triggerBackgroundSync]);

  const assignTeacher = useCallback((studentId, teacherId) => {
    if (!teacherId || teacherId === '') {
      setStudents(prev => prev.map(s => String(s.id) === String(studentId) ? { ...s, teacherId: null, teacherName: '', status: 'Chưa phân công' } : s));
      api.students?.update(studentId, { teacherId: null }).then(() => triggerBackgroundSync()).catch(console.error);
      return;
    }

    const teacher = teachers.find(t => String(t.id) === String(teacherId) || String(t._id) === String(teacherId));
    if (!teacher) return;

    setStudents(prev => prev.map(s => String(s.id) === String(studentId) ? { ...s, teacherId, teacherName: teacher.name, status: 'Đang học' } : s));
    
    api.students?.update(studentId, { teacherId })
      .then(() => triggerBackgroundSync())
      .catch(console.error);

    const student = students.find(s => String(s.id) === String(studentId));
    addNotification(teacherId, 'teacher', `Admin phân công học viên ${student?.name} cho bạn`);
  }, [teachers, students, triggerBackgroundSync]);

  const approveTeacher = useCallback((teacherId) => {
    setTeachers(prev => prev.map(t => String(t.id) === String(teacherId) ? { ...t, status: 'Active', practicalStatus: 'approved' } : t));
    
    api.teachers?.approve(teacherId)
      .then(() => triggerBackgroundSync())
      .catch(console.error);

    addNotification(teacherId, 'teacher', 'Chúc mừng! Admin đã cấp quyền Giảng viên cho bạn.');
  }, [triggerBackgroundSync]);

  // Từ chối giảng viên
  const rejectTeacher = useCallback((teacherId, reason) => {
    setTeachers(prev => prev.map(t =>
      String(t.id) === String(teacherId) ? { ...t, status: 'Locked', practicalStatus: 'rejected' } : t
    ));
    addNotification(teacherId, 'teacher', `Bài thực hành bị từ chối: ${reason}`);
  }, []);

  // Chuyển tiền GV → gọi backend tạo Transaction
  const payTeacher = useCallback(async (teacherId, amount, note) => {
    const teacher = teachers.find(t => String(t.id) === String(teacherId));
    if (!teacher) return;

    const now = new Date();
    const month = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

    // Optimistic update
    const tx = {
      id: Date.now(), teacherId, teacherName: teacher.name,
      amount, date: now.toLocaleDateString('vi-VN'),
      note: note || `Thù lao ${month}`,
      status: 'confirmed',
    };
    setTransactions(prev => [...prev, tx]);
    setTeachers(prev => prev.map(t =>
      String(t.id) === String(teacherId) ? { ...t, paidAmount: (t.paidAmount || 0) + amount } : t
    ));
    addNotification(teacherId, 'teacher', `Admin đã chuyển ${amount.toLocaleString('vi-VN')}đ - ${tx.note}`);

    // Gọi backend tạo & xác nhận transaction
    try {
      const res = await api.transactions?.create({
        teacherId, amount,
        description: note || `Thù lao ${month}`,
        month,
      });
      if (res?.success) {
        await api.transactions?.confirm(res.data._id);
        triggerBackgroundSync();
      }
    } catch (e) {
      console.error('[payTeacher] API error:', e);
    }
  }, [teachers, triggerBackgroundSync]);

  // Xóa học viên
  const removeStudent = useCallback(async (studentId) => {
    try {
      const res = await api.students.remove(studentId);
      if (res?.success) {
        setStudents(prev => prev.filter(s => String(s.id) !== String(studentId) && String(s._id) !== String(studentId)));
        setTeachers(prev => prev.map(t => ({
          ...t, assignedStudents: (t.assignedStudents || []).filter(id => String(id) !== String(studentId))
        })));
        return true;
      } else {
        console.error('[removeStudent] API failed:', res?.message);
        throw new Error(res?.message || 'Xoá thất bại');
      }
    } catch (err) {
      console.error('[removeStudent] Error:', err);
      throw err;
    }
  }, []);

  // Đánh dấu học phí đã thanh toán → gọi backend (tự tạo hóa đơn)
  const markStudentPaid = useCallback(async (studentId, isPaid = true, paymentMethod = 'transfer') => {
    // Optimistic update UI ngay
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId)
        ? { ...s, paid: isPaid, status: isPaid ? 'Đang học' : s.status }
        : s
    ));
    if (isPaid) {
      try {
        await api.students?.pay(studentId, paymentMethod);
        triggerBackgroundSync();
      } catch (e) {
        console.error('[markStudentPaid] API error:', e);
      }
    }
  }, [triggerBackgroundSync]);

  // ── TEACHER ACTIONS ────────────────────────────────────────────────────────

  // Điểm danh
  const markAttendance = useCallback(async (studentId, note, grade) => {
    let wasAlreadyAttendedToday = false;
    
    // Check synchronously to avoid race conditions with React state updates when spam-clicking
    const targetStudentSync = students.find(s => String(s.id) === String(studentId) || String(s._id) === String(studentId));
    const todayISO = new Date().toISOString().split('T')[0];
    const todayVN = new Date().toLocaleDateString('vi-VN');
    
    // Check if attended in student.grades
    const hasAttendedSync = targetStudentSync ? (targetStudentSync.grades || []).some(g => g.date === todayVN) : false;
    
    // Check if attended in schedules (for double safety)
    const hasScheduleAttended = schedules.some(sch => 
      String(sch.studentId) === String(studentId) && 
      (new Date(sch.date).toISOString().split('T')[0] === todayISO) && 
      sch.status === 'completed'
    );

    // 🔐 COOLDOWN 12H: Kiểm tra cờ can_check_in từ dữ liệu học viên (đồng bộ từ Backend)
    // Nếu can_check_in === false (nghĩa là đã điểm danh trong vòng 12h), chặn ngay lập tức
    if (targetStudentSync && targetStudentSync.can_check_in === false) {
      const remain = targetStudentSync.remaining_cooldown_hours || 0;
      const err = new Error(`Học viên này đã được điểm danh. Vui lòng thử lại sau ${remain} tiếng.`);
      err.cooldown = true;
      err.remainingHours = remain;
      throw err;
    }

    setStudents(prev => prev.map(s => {
      const isTargetStudent = String(s.id) === String(studentId) || String(s._id) === String(studentId);
      if (!isTargetStudent) return s;

      const todayStr = new Date().toLocaleDateString('vi-VN');
      const existingGradeIndex = (s.grades || []).findIndex(g => g.date === todayStr);
      wasAlreadyAttendedToday = existingGradeIndex !== -1;

      // Nếu đã điểm danh rồi, thì chỉ CẬP NHẬT điểm/ghi chú, không tăng buổi đã học
      if (wasAlreadyAttendedToday) {
        const newGrades = [...(s.grades || [])];
        newGrades[existingGradeIndex] = {
          ...newGrades[existingGradeIndex],
          note: note || newGrades[existingGradeIndex].note || 'Đã điểm danh',
          grade: grade !== undefined ? grade : newGrades[existingGradeIndex].grade,
        };
        
        const validGrades = newGrades.filter(g => g.grade > 0);
        const avg = validGrades.length > 0
          ? Math.round((validGrades.reduce((sum, g) => sum + g.grade, 0) / validGrades.length) * 10) / 10
          : 0;

        api.students?.update(studentId, {
          lastGrade: grade !== undefined ? grade : s.lastGrade,
          avgGrade: avg,
          grades: newGrades
        }).then(() => triggerBackgroundSync());

        return {
          ...s,
          lastGrade: grade !== undefined ? grade : s.lastGrade,
          avgGrade: avg,
          grades: newGrades
        };
      }

      // NẾU CHƯA ĐIỂM DANH HÔM NAY: Tạo mới
      if (s.remainingSessions <= 0) return s;

      const newGrade = {
        date: todayStr,
        note: note || 'Đã điểm danh',
        grade: grade || 0,
      };
      
      const newGrades = [newGrade, ...(s.grades || [])];
      const validGrades = newGrades.filter(g => g.grade > 0);
      const avg = validGrades.length > 0
        ? Math.round((validGrades.reduce((sum, g) => sum + g.grade, 0) / validGrades.length) * 10) / 10
        : 0;
      
      const newCompleted = (s.completedSessions || 0) + 1;
      const newRemaining = s.remainingSessions - 1;
      
      // ✅ FIX: KHÔNG ghi completedSessions/remainingSessions vào Student document
      // vì studentRoutes.js đã tính lại từ Schedule.countDocuments() khi GET
      // → Nếu ghi vào Student sẽ bị cộng đôi khi background sync kéo về
      api.students?.update(studentId, {
        lastGrade: grade || s.lastGrade,
        avgGrade: avg,
        grades: newGrades,
        status: newRemaining <= 0 ? 'Hoàn thành' : 'Đang học',
      })
      .then(() => triggerBackgroundSync())
      .catch(err => console.error('[markAttendance] API Update Error:', err));

      return {
        ...s,
        completedSessions: newCompleted,  // optimistic local only
        remainingSessions: newRemaining,  // optimistic local only
        lastGrade: grade || s.lastGrade,
        avgGrade: avg,
        grades: newGrades,
        status: newRemaining <= 0 ? 'Hoàn thành' : 'Đang học',
        // Optimistic: khoá nút điểm danh ngay sau khi điểm danh thành công
        can_check_in: false,
        remaining_cooldown_hours: 12,
      };
    }));
    console.log(`[markAttendance] Success for student: ${studentId}, grade: ${grade}`);
    addNotification(studentId, 'student', `Giảng viên đã điểm danh buổi học. Điểm: ${grade || 0}/10`);

    // Cập nhật schedule — CHỈ MỘT trong hai đường: UPDATE hoặc CREATE
    // Kiểm tra lại hasScheduleAttended (đã tính trước setStudents) làm gate dứt khoát
    if (hasScheduleAttended) {
      // Đường 1: Đã có schedule hôm nay → chỉ UPDATE status thành 'completed'
      const today = new Date().toISOString().split('T')[0];
      const existSch = schedules.find(sch => {
        const schDate = new Date(sch.date).toISOString().split('T')[0];
        return String(sch.studentId) === String(studentId) && schDate === today;
      });
      if (existSch && existSch.status !== 'completed') {
        api.schedules?.update(existSch._id || existSch.id, { status: 'completed' })
          .then(() => setTimeout(() => triggerBackgroundSync(), 500))
          .catch(e => console.log('[markAttendance] update err:', e));
        setSchedules(prev => prev.map(s =>
          (s._id || s.id) === (existSch._id || existSch.id) ? { ...s, status: 'completed' } : s
        ));
      }
    } else {
      // Đường 2: Chưa có schedule hôm nay → CREATE mới
      const getActiveSession = () => {
        try {
          return JSON.parse(localStorage.getItem('teacher_user') || localStorage.getItem('admin_user') || '{}');
        } catch { return {}; }
      };
      const activeSession = getActiveSession();
      const targetStudent = students.find(s => String(s.id) === String(studentId) || String(s._id) === String(studentId));

      let effectiveTeacherId = activeSession.id || activeSession._id;
      let studentDisplayName = `HV-${String(studentId).slice(-4)}`;
      let courseName = '';

      if (targetStudent) {
        const rawTeacherId = typeof targetStudent.teacherId === 'object' && targetStudent.teacherId !== null
          ? (targetStudent.teacherId._id || targetStudent.teacherId.id)
          : (targetStudent.teacherId || null);
        const isValidObjId = id => /^[a-f\d]{24}$/i.test(String(id));
        if (isValidObjId(rawTeacherId)) effectiveTeacherId = rawTeacherId;
        else if (isValidObjId(activeSession.id || activeSession._id)) effectiveTeacherId = activeSession.id || activeSession._id;
        else effectiveTeacherId = rawTeacherId || activeSession.id || activeSession._id;

        studentDisplayName = (targetStudent.name && !/^\d{5,}$/.test(targetStudent.name))
          ? targetStudent.name
          : targetStudent.email || targetStudent.phone || studentDisplayName;
        courseName = targetStudent.course || '';
      }

      if (effectiveTeacherId) {
        const now = new Date();
        const tempId = 'temp-' + Date.now();
        const newSch = {
          id: tempId,
          teacherId: String(effectiveTeacherId),
          teacherName: activeSession.name || 'Giảng viên',
          studentId: String(studentId),
          studentName: studentDisplayName,
          date: now.toISOString().split('T')[0],
          startTime: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          course: courseName,
          status: 'completed',
          paymentStatus: 'pending',
        };

        // Optimistic: thêm vào UI ngay để chặn spam click
        setSchedules(prev => [...prev, newSch]);

        api.schedules?.create(newSch).then(res => {
          if (res?.success && res.data) {
            setSchedules(prev => prev.map(s => s.id === tempId ? { ...res.data, id: res.data._id } : s));
            setTimeout(() => triggerBackgroundSync(), 500);
          } else if (res?.cooldown) {
            setSchedules(prev => prev.filter(s => s.id !== tempId));
            setStudents(prev => prev.map(s =>
              String(s.id) === String(studentId) || String(s._id) === String(studentId)
                ? { ...s, can_check_in: false, remaining_cooldown_hours: res.remainingHours || 12 }
                : s
            ));
            const err = new Error(res.message || 'Đã điểm danh trong vòng 12 tiếng');
            err.cooldown = true;
            throw err;
          } else {
            console.error('[markAttendance] Create failed:', res?.message);
            setSchedules(prev => prev.filter(s => s.id !== tempId));
          }
        }).catch(err => {
          console.error('[markAttendance] Create error:', err);
          setSchedules(prev => prev.filter(s => s.id !== tempId));
        });
      } else {
        console.error('[markAttendance] No teacherId found, cannot create schedule');
      }
    }
  }, [students, schedules, triggerBackgroundSync, addNotification]);


  const updateStudentLink = useCallback((studentId, linkHoc) => {
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId) ? { ...s, linkHoc } : s
    ));
    addNotification(studentId, 'student',
      `📍 Giảng viên đã cập nhật link học mới. Nhấn vào đây đở tham gia.`);
    
    api.students?.update(studentId, { linkHoc }).then(() => triggerBackgroundSync());
  }, [triggerBackgroundSync]);

  // Cập nhật lịch học — sync sang StudentDashboard
  const updateStudentSchedule = useCallback((studentId, nextClass, nextClassTime) => {
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId) ? { ...s, nextClass, nextClassTime } : s
    ));
    addNotification(studentId, 'student',
      `📅 Lịch học đã được cập nhật: ${nextClass}. Nhớ tham gia đúng giờ!`);
      
    api.students?.update(studentId, { nextClass, nextClassTime }).then(() => triggerBackgroundSync());
  }, [triggerBackgroundSync]);

  // GV nộp bài test
  const submitTestResult = useCallback((teacherId, score, passed) => {
    setTeachers(prev => prev.map(t =>
      String(t.id) === String(teacherId) ? { ...t, testScore: score, testStatus: passed ? 'passed' : 'failed' } : t
    ));
    addNotification(null, 'admin', `Giảng viên ID ${teacherId} đã nộp bài test: ${score} điểm - ${passed ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
  }, []);

  // ── EXAM APPROVAL ────────────────────────────────────────────────────────

  // Admin duyệt cho học viên thi cuối khóa → gọi backend unlock
  const approveStudentExam = useCallback(async (studentId) => {
    const student = students.find(s => String(s.id) === String(studentId));
    if (!student) return;

    // Optimistic update
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId)
        ? { ...s, examApproved: true, studentExamUnlocked: true }
        : s
    ));
    addNotification(studentId, 'student',
      'ðŸŽ“ Admin đã duyệt cho bạn thi cuối khóa! Vào Phòng Thi đở bắt đầu.');
    addNotification(null, 'admin',
      `Đã duyệt thi cuối khóa cho học viên ${student.name}`);

    // Gọi backend
    try {
      await api.students?.update(studentId, { studentExamUnlocked: true, examApproved: true });
    } catch (e) {
      console.error('[approveStudentExam] API error:', e);
    }
  }, [students]);

  // Admin thu hồi quyền thi → gọi backend lock
  const revokeStudentExam = useCallback(async (studentId, reason = '') => {
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId)
        ? { ...s, examApproved: false, studentExamUnlocked: false }
        : s
    ));
    try {
      await api.students?.update(studentId, { studentExamUnlocked: false, examApproved: false });
    } catch (e) {
      console.error('[revokeStudentExam] API error:', e);
    }
  }, []);

  const saveExamResult = useCallback((studentId, subject, score, passed) => {
    setStudents(prev => prev.map(s =>
      String(s.id) === String(studentId)
        ? { ...s, examResults: { ...(s.examResults || {}), [subject]: { score, passed, date: new Date().toLocaleDateString('vi-VN') } } }
        : s
    ));
  }, []);

  // ── KẾT QUẢ THI ADMIN — ghi nhận & chấm điởm (lưu vào MongoDB) ─────────────
  const addExamResult = useCallback(async (data) => {
    // Optimistic: cập nhật local ngay lập tức
    const tempId = `temp_${Date.now()}`;
    const newEntry = { ...data, id: tempId, createdAt: new Date().toISOString() };
    setExamResults(prev => [newEntry, ...prev]);
    try {
      const saved = await api.examResults.create(data);
      if (saved?._id) {
        // Thay tempId bằng _id thật từ server
        setExamResults(prev => prev.map(r => r.id === tempId ? { ...saved, id: saved._id } : r));
      }
    } catch (e) {
      console.error('[addExamResult] API error, giữ local:', e);
    }
  }, []);

  const updateExamResult = useCallback(async (id, updates) => {
    // Optimistic update
    setExamResults(prev => prev.map(r => (r.id === id || r._id === id) ? { ...r, ...updates } : r));
    try {
      // id có thỒ là _id của MongoDB hoặc tempId
      const mongoId = id.startsWith?.('temp_') ? null : id;
      if (mongoId) await api.examResults.update(mongoId, updates);
    } catch (e) {
      console.error('[updateExamResult] API error, giữ local:', e);
    }
  }, []);

  const removeExamResult = useCallback(async (id) => {
    // Optimistic remove
    setExamResults(prev => prev.filter(r => r.id !== id && r._id !== id));
    try {
      const mongoId = id.startsWith?.('temp_') ? null : id;
      if (mongoId) await api.examResults.remove(mongoId);
    } catch (e) {
      console.error('[removeExamResult] API error, giữ local:', e);
    }
  }, []);

  // GV nộp file thực hành
  const submitPracticalFile = useCallback((teacherId, fileName) => {
    setTeachers(prev => prev.map(t =>
      String(t.id) === String(teacherId) ? { ...t, practicalFile: fileName, practicalStatus: 'pending' } : t
    ));
    addNotification(null, 'admin', `Giảng viên ID ${teacherId} đã nộp bài thực hành: ${fileName}`);
  }, []);

  // ── MESSAGING (Backend API + Real-time) ────────────────────────────────────

  const API_URL = API_BASE;

  // Gửi tin nhắn qua API → lưu MongoDB → phát Socket.io
  const sendMessage = useCallback(async (msg) => {
    const tempId = `temp_${Date.now()}`;
    const convId = msg.isGroup && msg.groupId
      ? `group_${msg.groupId}`
      : [`${msg.senderRole}_${msg.senderId}`, `${msg.receiverRole}_${msg.receiverId}`].sort().join('__');
    const newMsg = {
      id: tempId,
      convId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      receiverId: msg.receiverId,
      receiverName: msg.receiverName,
      receiverRole: msg.receiverRole,
      content: msg.content,
      messageType: msg.messageType || 'text',
      fileUrl: msg.fileUrl || '',
      fileName: msg.fileName || '',
      time: new Date(),
      read: false,
      isRecalled: false,
      reactions: [],
    };
    setMessages(prev => [...prev, newMsg]);

    // Gửi lên backend lưu vào MongoDB → thay tempId bằng _id thật
    try {
      const res = await api.messages.send({
        senderId: String(msg.senderId),
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        receiverId: String(msg.receiverId),
        receiverName: msg.receiverName,
        receiverRole: msg.receiverRole,
        content: msg.content,
        messageType: msg.messageType || 'text',
        fileUrl: msg.fileUrl || '',
        fileName: msg.fileName || '',
        isGroup: msg.isGroup || false,
        groupId: msg.groupId || null,
      });
      if (res?.success && res?.data?._id) {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: res.data._id } : m
        ));
        return { ...newMsg, id: res.data._id };
      }
    } catch (err) {
      console.error('[MSG] Lỗi gửi tin nhắn lên server:', err);
    }
    return newMsg;
  }, []);

  const syncMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const json = await api.messages.syncByUser(userId);
      if (json.success) {
        const syncedMsgs = json.data.map(m => {
          // Xác định convId đúng: nhóm hay cá nhân
          const convId = m.isGroup && m.groupId
            ? `group_${m.groupId}`
            : m.conversationId;
          return {
            id: m._id,
            convId,
            groupId: m.groupId,
            isGroup: m.isGroup || false,
            senderId: m.senderId,
            senderName: m.senderName,
            senderRole: m.senderRole,
            receiverId: m.receiverId,
            receiverName: m.receiverName,
            receiverRole: m.receiverRole,
            content: m.content,
            messageType: m.messageType || 'text',
            fileUrl: m.fileUrl || '',
            fileName: m.fileName || '',
            time: new Date(m.createdAt),
            read: m.isRead,
            isRecalled: m.isRecalled || false,
            reactions: m.reactions || [],
          };
        });
        setMessages(syncedMsgs);
      }
    } catch (err) {
      console.error('[MSG] Lỗi đồng bộ tin nhắn:', err);
    }
  }, []);

  const toggleMessageReaction = useCallback(async (messageId, type) => {
    try {
      const json = await api.messages.toggleReaction(messageId, type);
      if (json.success) {
        setMessages(prev => prev.map(m => 
          String(m.id) === String(messageId) ? { ...m, reactions: json.data } : m
        ));
      }
    } catch (err) {
      console.error('[MSG] Lỗi cập nhật reaction:', err);
    }
  }, []);

  const recallMessage = useCallback(async (messageId) => {
    try {
      const json = await api.messages.recall(messageId);
      if (json.success) {
        setMessages(prev => prev.map(m =>
          String(m.id) === String(messageId) ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' } : m
        ));
      }
    } catch (err) {
      console.error('[MSG] Lỗi thu hồi tin nhắn:', err);
    }
  }, []);

  const softDeleteMessage = useCallback(async (messageId) => {
    try {
      const json = await api.messages.softDelete(messageId);
      if (json.success) {
        // Chỉ ẩn/xóa khỏi mảng cục bộ trên giao diện của user này
        setMessages(prev => prev.filter(m => String(m.id) !== String(messageId)));
      }
    } catch (err) {
      console.error('[MSG] Lỗi xóa tin nhắn:', err);
    }
  }, []);

  const createChatGroup = useCallback(async (name, participants) => {
    try {
      const json = await api.messages.createGroup(name, participants);
      if (json.success) {
        setGroups(prev => [json.data, ...prev]);
        triggerBackgroundSync();
        return json.data;
      }
    } catch (err) {
      console.error('[MSG] Lỗi tạo nhóm:', err);
    }
    return null;
  }, [triggerBackgroundSync]);

  const deleteChatGroup = useCallback(async (groupId) => {
    try {
      const json = await api.messages.deleteGroup(groupId);
      if (json.success) {
        setGroups(prev => prev.filter(g => String(g._id) !== String(groupId) && String(g.id) !== String(groupId)));
        setMessages(prev => prev.filter(m => m.convId !== `group_${groupId}`));
        triggerBackgroundSync();
        return true;
      }
    } catch (err) {
      console.error('[MSG] Lỗi xóa nhóm:', err);
    }
    return false;
  }, [triggerBackgroundSync]);

  const markMessagesRead = useCallback(async (convId, readerId) => {
    let needsUpdate = false;
    setMessages(prev => {
      const hasUnread = prev.some(m => m.convId === convId && String(m.receiverId) === String(readerId) && !m.read);
      if (!hasUnread) return prev; // Ngắt vòng lặp vô hạn nếu không có tin chưa đọc
      needsUpdate = true;
      return prev.map(m =>
        m.convId === convId && String(m.receiverId) === String(readerId) ? { ...m, read: true } : m
      );
    });

    if (needsUpdate) {
      // Đồng bộ lên backend thông qua centralized api service (có token)
      try {
        await api.messages.markRead(convId, readerId);
      } catch (err) {
        console.error('[MSG] Lỗi đánh dấu đã đọc:', err);
      }
    }
  }, []);

  // Helper: Tạo conversationId chuẩn (role_id format, sorted)
  const makeConvId = (role1, id1, role2, id2) => {
    return [`${role1}_${id1}`, `${role2}_${id2}`].sort().join('__');
  };

  const getConversations = useCallback((userId) => {
    const sId = String(userId);
    const userRole = (sId === 'admin') ? 'admin' : (students.find(s => String(s.id) === sId) ? 'student' : 'teacher');

    // Filter messages where user is sender or receiver
    const userMsgs = messages.filter(m => String(m.senderId) === sId || String(m.receiverId) === sId);
    const convMap = {};

    // 1. Add existing conversations from messages
    userMsgs.forEach(m => {
      if (!convMap[m.convId] || m.time > convMap[m.convId].lastTime) {
        const otherUserId = String(m.senderId) === sId ? m.receiverId : m.senderId;
        const otherName = String(m.senderId) === sId ? m.receiverName : m.senderName;
        const otherRole = String(m.senderId) === sId ? m.receiverRole : m.senderRole;
        convMap[m.convId] = {
          id: m.convId,
          user: { id: otherUserId, name: otherName, role: otherRole, avatar: String(otherName || 'U').substring(0, 2).toUpperCase(), online: true },
          lastMessage: m.content,
          lastTime: m.time,
          unread: userMsgs.filter(um => um.convId === m.convId && String(um.receiverId) === sId && !um.read).length,
        };
      }
    });

    // 2. Add potential contacts
    if (userRole === 'student') {
      const student = students.find(s => String(s.id) === sId);
      if (student && student.teacherId) {
        const t = teachers.find(t => t.id === student.teacherId);
        const convId = makeConvId('student', sId, 'teacher', student.teacherId);
        if (t && !convMap[convId]) {
          convMap[convId] = {
            id: convId,
            user: { id: t.id, name: t.name, role: 'teacher', avatar: String(t.name || 'GV').substring(0, 2).toUpperCase(), online: true },
            lastMessage: 'Chưa có tin nhắn',
            lastTime: new Date(0),
            unread: 0,
          };
        }
      }
      // Thêm Admin vào danh bạ của Học viên
      const adminConvId = makeConvId('student', sId, 'admin', 'admin');
      if (!convMap[adminConvId]) {
        convMap[adminConvId] = {
          id: adminConvId,
          user: { id: 'admin', name: 'Admin Thắng Tin Học', role: 'admin', avatar: 'AD', online: true },
          lastMessage: 'Chưa có tin nhắn',
          lastTime: new Date(0),
          unread: 0,
        };
      }
    } else if (userRole === 'teacher') {
      const myStudents = students.filter(s => String(s.teacherId) === sId);
      myStudents.forEach(s => {
        const convId = makeConvId('teacher', sId, 'student', s.id);
        if (!convMap[convId]) {
          convMap[convId] = {
            id: convId,
            user: { id: s.id, name: s.name, role: 'student', avatar: String(s.name || 'HV').substring(0, 2).toUpperCase(), online: true },
            lastMessage: 'Chưa có tin nhắn',
            lastTime: new Date(0),
            unread: 0,
          };
        }
      });

      // Admin contact
      const adminConvId = makeConvId('admin', 'admin', 'teacher', sId);
      if (!convMap[adminConvId]) {
        convMap[adminConvId] = {
          id: adminConvId,
          user: { id: 'admin', name: 'Admin Thắng Tin Học', role: 'admin', avatar: 'AD', online: true },
          lastMessage: 'Chưa có tin nhắn',
          lastTime: new Date(0),
          unread: 0,
        };
      }
    } else if (userRole === 'admin') {
      // All active teachers
      teachers.filter(t => t.status === 'Active' || t.status === 'active').forEach(t => {
        const convId = makeConvId('admin', 'admin', 'teacher', t.id);
        if (!convMap[convId]) {
          convMap[convId] = {
            id: convId,
            user: { id: t.id, name: t.name, role: 'teacher', avatar: String(t.name || 'GV').substring(0, 2).toUpperCase(), online: true },
            lastMessage: 'Chưa có tin nhắn',
            lastTime: new Date(0),
            unread: 0,
          };
        }
      });

      // All students
      students.forEach(s => {
        const convId = makeConvId('admin', 'admin', 'student', s.id);
        if (!convMap[convId]) {
          convMap[convId] = {
            id: convId,
            user: { id: s.id, name: s.name, role: 'student', avatar: String(s.name || 'HV').substring(0, 2).toUpperCase(), online: true },
            lastMessage: 'Chưa có tin nhắn',
            lastTime: new Date(0),
            unread: 0,
          };
        }
      });
    }

    // 3. Add Groups
    if (groups && Array.isArray(groups)) {
      groups.filter(g => g.participants?.some(p => String(p.userId) === sId)).forEach(g => {
        const groupMsgs = messages.filter(m => String(m.groupId) === String(g._id));
        const lastMsg = groupMsgs.length > 0 ? groupMsgs[groupMsgs.length - 1] : null;
        const convId = `group_${g._id}`;

        convMap[convId] = {
          id: convId,
          isGroup: true,
          user: { id: g._id, name: g.name, role: 'group', avatar: 'GN', online: true },
          lastMessage: lastMsg ? lastMsg.content : 'Bắt đầu cuộc trò chuyện nhóm',
          lastTime: lastMsg ? lastMsg.time : new Date(g.createdAt || 0),
          unread: groupMsgs.filter(m => !m.read && String(m.senderId) !== sId).length,
        };
      });
    }

    return Object.values(convMap).sort((a, b) => {
      // Ghim Admin lên đầu
      if (a.user.role === 'admin' && b.user.role !== 'admin') return -1;
      if (b.user.role === 'admin' && a.user.role !== 'admin') return 1;
      return b.lastTime - a.lastTime;
    });
  }, [messages, students, teachers, groups]);

  const getMessages = useCallback((convId) => {
    return messages.filter(m => m.convId === convId).sort((a, b) => a.time - b.time);
  }, [messages]);

  // ── SCHEDULE ──────────────────────────────────────────────────────────────────────────────────

  const addSchedule = useCallback((schedule) => {
    const student = students.find(s => String(s.id) === String(schedule.studentId) || String(s._id) === String(schedule.studentId));
    const teacher = teachers.find(t => String(t.id) === String(schedule.teacherId) || String(t._id) === String(schedule.teacherId));
    const studentDisplayName = student
      ? ((student.name && !/^\d{5,}$/.test(student.name)) ? student.name : student.email || student.phone || `HV-${String(student.id || student._id || '').slice(-4)}`)
      : (schedule.studentName || '');
    const tempId = `temp_${Date.now()}`;
    const newSched = {
      ...schedule,
      id: tempId,
      status: schedule.status || 'scheduled',
      studentName: studentDisplayName,
      teacherName: teacher?.name || schedule.teacherName || '',
    };
    // Optimistic UI: hiện ngay
    setSchedules(prev => [...prev, newSched]);
    // Đồng bộ nextClass cho student
    if (student) {
      const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const d = new Date(schedule.date);
      const dayName = dayNames[d.getDay()];
      const dateStr = `${schedule.startTime} - ${dayName} (${d.toLocaleDateString('vi-VN')})`;
      setStudents(prev => prev.map(s =>
        (String(s.id) === String(schedule.studentId) || String(s._id) === String(schedule.studentId))
          ? { ...s, nextClass: dateStr, nextClassTime: `${schedule.date}T${schedule.startTime}:00` } : s
      ));
    }
    addNotification(schedule.studentId, 'student', `📅 Lịch học mới: ${schedule.course} lúc ${schedule.startTime} ngày ${schedule.date}`);

    // Gửi lên server — không gửi local id
    const payload = { ...newSched };
    delete payload.id;
    delete payload._id;

    api.schedules?.create(payload).then(res => {
      if (res?.success && res.data) {
        // Thay thế temp record bằng record thật từ DB
        setSchedules(prev => prev.map(s =>
          s.id === tempId ? { ...res.data, id: res.data._id } : s
        ));
        triggerBackgroundSync();
      } else {
        // Rollback nếu fail
        console.error('[addSchedule] Server error:', res?.message);
        alert(`Không thể xếp lịch: ${res?.message || 'Lỗi không xác định'}`);
        setSchedules(prev => prev.filter(s => s.id !== tempId));
      }
    }).catch(err => {
      console.error('[addSchedule] Network error:', err);
      alert('Lỗi mạng kết nối, không thể xếp lịch.');
      setSchedules(prev => prev.filter(s => s.id !== tempId));
    });

    return newSched;
  }, [students, teachers, triggerBackgroundSync, addNotification]);

  // Cập nhật lịch học (GV đổi giờ/link/topic)
  const updateSchedule = useCallback((scheduleId, updates) => {
    let updatedSched = null;
    setSchedules(prev => prev.map(sch => {
      if (String(sch.id) === String(scheduleId) || String(sch._id) === String(scheduleId)) {
        updatedSched = { ...sch, ...updates };
        return updatedSched;
      }
      return sch;
    }));
    if (updatedSched) {
      // Đồng bộ link học sang student nếu link thay đổi
      if (updates.linkHoc) {
        setStudents(prev => prev.map(s =>
          s.id === updatedSched.studentId ? { ...s, linkHoc: updates.linkHoc } : s
        ));
      }
      addNotification(updatedSched.studentId, 'student',
        `ðŸ“… Lịch học đã cập nhật: ${updates.topic || updatedSched.topic} — ${updates.startTime || updatedSched.startTime} ngày ${updates.date || updatedSched.date}`);
      const payload = { ...updates };
      delete payload.id;
      delete payload._id;
      api.schedules?.update(scheduleId, payload).then(() => triggerBackgroundSync());
    }
  }, [triggerBackgroundSync, addNotification]);

  // Hủy buổi học
  const cancelSchedule = useCallback((scheduleId, reason) => {
    let cancelled = null;
    setSchedules(prev => prev.map(sch => {
      if (String(sch.id) === String(scheduleId) || String(sch._id) === String(scheduleId)) {
        cancelled = { ...sch, status: 'cancelled', cancelReason: reason };
        return cancelled;
      }
      return sch;
    }));
    if (cancelled) {
      addNotification(cancelled.studentId, 'student',
        `⚠ï¸ Buổi học ngày ${cancelled.date} đã bị hủy. Lý do: ${reason || 'Không rõ'}`);
      addNotification(cancelled.teacherId, 'teacher',
        `Đã hủy buổi học với ${cancelled.studentName} ngày ${cancelled.date}`);
      api.schedules?.update(scheduleId, { status: 'cancelled', cancelReason: reason }).then(() => triggerBackgroundSync());
    }
  }, [triggerBackgroundSync, addNotification]);

  // ── MATERIALS (GV upload tài liệu) ─────────────────────────────────────────

  const addMaterial = useCallback((material) => {
    const newMat = { ...material, id: Date.now(), uploadDate: new Date().toISOString().split('T')[0] };
    setMaterials(prev => [...prev, newMat]);
    // Thông báo tất cả HV đang học course đó
    students.filter(s => s.course && s.course.includes(material.course || '')).forEach(s => {
      addNotification(s.id, 'student', `ðŸ“š Tài liệu mới: ${material.name}`);
    });
    return newMat;
  }, [students, addNotification]);

  const removeMaterial = useCallback((materialId) => {
    setMaterials(prev => prev.filter(m => m.id !== materialId));
  }, []);

  // Lấy tài liệu theo khóa học
  const getMaterialsByCourse = useCallback((courseName) => {
    return materials.filter(m => m.course === courseName || courseName.includes(m.course));
  }, [materials]);

  // Lấy tài liệu theo loại
  const getMaterialsByCategory = useCallback((category, courseName) => {
    return materials.filter(m => m.category === category && (m.course === courseName || !courseName || courseName.includes(m.course)));
  }, [materials]);

  // ── HELPERS ────────────────────────────────────────────────────────────────

  const getStudentsByTeacher = useCallback((teacherId) => {
    return students.filter(s => String(typeof s.teacherId === 'object' && s.teacherId !== null ? s.teacherId._id || s.teacherId.id : s.teacherId) === String(teacherId));
  }, [students]);

  const getTeacherStats = useCallback((teacherId) => {
    const myStudents = students.filter(s => String(typeof s.teacherId === 'object' && s.teacherId !== null ? s.teacherId._id || s.teacherId.id : s.teacherId) === String(teacherId));
    const totalSessions = myStudents.reduce((sum, s) => sum + (s.completedSessions != null ? s.completedSessions : (s.totalSessions - s.remainingSessions) || 0), 0);
    const avgGrade = myStudents.length > 0
      ? Math.round((myStudents.reduce((sum, s) => sum + (s.avgGrade || 0), 0) / myStudents.length) * 10) / 10
      : 0;
    const completed = myStudents.filter(s => s.status === 'Hoàn thành' || s.remainingSessions <= 0).length;
    return { studentCount: myStudents.length, totalSessions, avgGrade, completed };
  }, [students]);

  const getAdminStats = useCallback(() => {
    const totalRevenue = students.filter(s => s.paid).reduce((sum, s) => sum + (s.price || 0), 0);
    const activeTeachers = teachers.filter(t => t.status === 'Active' || t.status === 'active').length;
    const pendingTeachers = teachers.filter(t => t.status === 'Pending').length;
    return {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      activeTeachers,
      pendingTeachers,
      totalRevenue,
    };
  }, [students, teachers]);

  const getSchedulesByTeacher = useCallback((teacherId) => {
    return schedules.filter(s => String(s.teacherId) === String(teacherId));
  }, [schedules]);

  const getSchedulesByStudent = useCallback((studentId) => {
    return schedules.filter(s => String(s.studentId) === String(studentId));
  }, [schedules]);

  const getTransactionsByTeacher = useCallback((teacherId) => {
    return transactions.filter(t => String(t.teacherId) === String(teacherId));
  }, [transactions]);

  // ── RATINGS (criteria-based, auto-calculate stars) ──────────────────────────

  const RATING_CRITERIA = {
    teaching: {
      label: 'Phương pháp dạy', options: [
        { key: 'effective', label: 'Hiệu quả', score: 5 },
        { key: 'normal', label: 'Bình thường', score: 3 },
        { key: 'limited', label: 'Kiến thức còn hạn chế', score: 1 },
      ]
    },
    voice: {
      label: 'Giọng nói', options: [
        { key: 'good', label: 'Ổn', score: 5 },
        { key: 'hard', label: 'Khó nghe', score: 2 },
      ]
    },
    guidance: {
      label: 'Hướng dẫn', options: [
        { key: 'fast', label: 'Nhanh', score: 4 },
        { key: 'ok', label: 'Ổn', score: 5 },
        { key: 'slow', label: 'Chậm', score: 2 },
      ]
    },
    support: {
      label: 'Hỗ trợ học viên', options: [
        { key: 'enthusiastic', label: 'Nhiệt tình', score: 5 },
        { key: 'moderate', label: 'Tương đối', score: 3 },
        { key: 'none', label: 'Không hỗ trợ', score: 1 },
      ]
    }
  };

  const rateTeacher = useCallback((teacherId, studentId, criteria, comment) => {
    // criteria = { teaching: 'effective', voice: 'good', guidance: 'ok', support: 'enthusiastic' }
    const student = students.find(s => s.id === studentId);
    // Auto-calculate stars from criteria scores
    const scores = Object.entries(criteria || {}).map(([cat, key]) => {
      const opt = RATING_CRITERIA[cat]?.options.find(o => o.key === key);
      return opt ? opt.score : 3;
    });
    const stars = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;

    setTeachers(prev => prev.map(t => {
      if (String(t.id) !== String(teacherId)) return t;
      const ratings = t.ratings || [];
      const existingIdx = ratings.findIndex(r => String(r.studentId) === String(studentId));
      const newRating = {
        studentId, studentName: student?.name || '', stars, criteria, comment,
        date: new Date().toISOString().split('T')[0],
      };
      const newRatings = [...ratings];
      if (existingIdx >= 0) newRatings[existingIdx] = newRating;
      else newRatings.push(newRating);
      return { ...t, ratings: newRatings };
    }));
    addNotification(teacherId, 'teacher',
      `⭐ ${student?.name || 'Học viên'} đã đánh giá bạn ${stars}/5 sao`);
  }, [students, teachers, addNotification]);

  const getTeacherRating = useCallback((teacherId) => {
    const teacher = teachers.find(t => String(t.id) === String(teacherId));
    if (!teacher || !teacher.ratings?.length) return { avg: 0, count: 0, ratings: [] };
    const avg = Math.round((teacher.ratings.reduce((s, r) => s + r.stars, 0) / teacher.ratings.length) * 10) / 10;
    return { avg, count: teacher.ratings.length, ratings: teacher.ratings };
  }, [teachers]);

  // ── PRIVATE EVALUATIONS (Hidden from Teachers) ─────────────────────────────

  const submitPrivateEvaluation = useCallback((data) => {
    // data = { studentId, teacherId, milestone, courseName, criteria, comment }
    const student = students.find(s => s.id === data.studentId);
    const teacher = teachers.find(t => t.id === data.teacherId);

    setPrivateEvaluations(prev => {
      // Find matching evaluation: same student AND same courseName AND same specific milestone
      const existingIdx = prev.findIndex(ev =>
        String(ev.studentId) === String(data.studentId) &&
        ev.courseName === data.courseName &&
        ev.milestone === data.milestone
      );

      const evalData = {
        ...data,
        id: existingIdx >= 0 ? prev[existingIdx].id : Date.now() + Math.random(),
        studentName: student?.name || 'Học viên',
        teacherName: teacher?.name || 'Giảng viên',
        date: new Date().toISOString().split('T')[0],
        read: false
      };

      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = evalData;
        return next;
      }
      return [...prev, evalData];
    });

    // Notify admin
    addNotification(null, 'admin',
      `ðŸ“¢ Đánh giá RIÊNG (Mốc: ${data.milestone === 'lesson_1' ? 'Buổi 1' : data.milestone === 'manual_feedback' ? 'Theo khóa học' : '50% khóa'}): HV ${student?.name} đánh giá GV ${teacher?.name}`
    );
  }, [students, teachers]);

  const getPrivateEvaluationsForAdmin = useCallback(() => {
    return [...privateEvaluations].sort((a, b) => b.id - a.id);
  }, [privateEvaluations]);

  const markEvaluationRead = useCallback((evalId) => {
    setPrivateEvaluations(prev => prev.map(ev => ev.id === evalId ? { ...ev, read: true } : ev));
  }, []);

  // ── VALUE ──────────────────────────────────────────────────────────────────

  const value = {
    // Exam Results
    examResults, addExamResult, updateExamResult, removeExamResult,
    // Data
    students, teachers, transactions, schedules, notifications: socketNotifications, messages, materials,
    currentUser, setCurrentUser,

    // Admin
    addStudent, addTeacher, removeTeacher, updateTeacher, updateStudent, assignTeacher, approveTeacher, rejectTeacher, payTeacher, removeStudent, grantPending,
    markStudentPaid,
    getAdminStats,
    // Pagination (Admin)
    studentsPagination, fetchStudentsPaginated,



    // Teacher
    markAttendance, updateStudentLink, updateStudentSchedule,
    submitTestResult, submitPracticalFile,
    getStudentsByTeacher, getTeacherStats, getSchedulesByTeacher, getTransactionsByTeacher,

    // Student
    getSchedulesByStudent,

    // Exam Approval
    approveStudentExam, revokeStudentExam, saveExamResult,

    // Messaging
    sendMessage, syncMessages, markMessagesRead, getConversations, getMessages,
    groups, recallMessage, softDeleteMessage, createChatGroup, deleteChatGroup,

    // Notifications
    addNotification, markNotificationRead, getNotifications,

    // Schedule
    addSchedule, updateSchedule, cancelSchedule,

    // Materials
    addMaterial, removeMaterial, getMaterialsByCourse, getMaterialsByCategory,

    // Ratings
    rateTeacher, getTeacherRating, RATING_CRITERIA,

    // Private Evaluations
    submitPrivateEvaluation, getPrivateEvaluationsForAdmin, markEvaluationRead, privateEvaluations,

    // Training (Admin manage, Teacher view)
    trainingData,
    studentTrainingData,
    addStudentTrainingItem: useCallback((category, item) => {
      setStudentTrainingData(prev => ({
        ...prev,
        [category]: [...(prev[category] || []), { ...item, id: Date.now() }]
      }));
    }, []),
    updateStudentTrainingItem: useCallback((category, id, updates) => {
      setStudentTrainingData(prev => ({
        ...prev,
        [category]: (prev[category] || []).map(item => item.id === id ? { ...item, ...updates } : item)
      }));
    }, []),
    removeStudentTrainingItem: useCallback((category, id) => {
      setStudentTrainingData(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(item => item.id !== id)
      }));
    }, []),
    addTrainingItem: useCallback((category, item) => {
      setTrainingData(prev => ({
        ...prev,
        [category]: [...(prev[category] || []), { ...item, id: Date.now() }]
      }));
    }, []),
    updateTrainingItem: useCallback((category, id, updates) => {
      setTrainingData(prev => ({
        ...prev,
        [category]: (prev[category] || []).map(item => item.id === id ? { ...item, ...updates } : item)
      }));
    }, []),
    removeTrainingItem: useCallback((category, id) => {
      setTrainingData(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(item => item.id !== id)
      }));
    }, []),

    // ── Question Bank CRUD ────────────────────────────────────────────────────
    questions,
    addQuestion: useCallback((q) => {
      setQuestions(prev => [...prev, { ...q, id: `q_${Date.now()}` }]);
    }, []),
    updateQuestion: useCallback((id, updates) => {
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    }, []),
    removeQuestion: useCallback((id) => {
      setQuestions(prev => prev.filter(q => q.id !== id));
    }, []),
    resetQuestions: useCallback(() => {
      setQuestions(QUESTION_BANK);
    }, []),

    // ── Student Question Bank CRUD ─────────────────────────────────────────────
    studentQuestions,
    addStudentQuestion: useCallback((q) => {
      setStudentQuestions(prev => [...prev, { ...q, id: `sq_${Date.now()}` }]);
    }, []),
    updateStudentQuestion: useCallback((id, updates) => {
      setStudentQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    }, []),
    removeStudentQuestion: useCallback((id) => {
      setStudentQuestions(prev => prev.filter(q => q.id !== id));
    }, []),
    resetStudentQuestions: useCallback(() => {
      setStudentQuestions([]);
    }, []),

    // ── System Logs ────────────────────────────────────────────────────────────
    systemLogs,
    addSystemLog: useCallback((action, target, adminName = 'Admin', color = 'bg-blue-500 text-white') => {
      setSystemLogs(prev => {
        const newLog = {
          id: Date.now(),
          action,
          target,
          admin: adminName,
          time: new Date().toLocaleString('vi-VN'),
          color
        };
        return [newLog, ...prev].slice(0, 100); // Giữ tối đa 100 logs gần nhất
      });
    }, []),

    isRefetching,
    triggerBackgroundSync,
    currentUser,
    setCurrentUser,
    toggleMessageReaction,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
};

export default DataContext;

