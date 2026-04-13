import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, Video, CheckCircle, Save, MessageSquare, FileText,
  GraduationCap, TrendingUp, Clock, Star, Link2, Upload,
  Bell, LogOut, Plus, ChevronRight, BookOpen, Award, Zap,
  BarChart3, Users, ArrowLeft, ChevronLeft, Eye, X, XCircle,
  Search, Download, AlertCircle, Clipboard, Send, UserCheck, Check,
  Activity, DollarSign, Filter, User, Phone, Mail, Building2,
  CreditCard, Landmark, Copy, Edit3, Shield, MapPin, Trash2, Ban, PlayCircle
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import TeacherAssignmentsView from './TeacherAssignmentsView';
import { useData } from '../context/DataContext';
import { useSocket } from '../context/SocketContext';
import api, { teachersAPI } from '../services/api';
import { useToast } from '../utils/toast';
import { useModal } from '../utils/Modal.jsx';
import { BankSelect } from './BankSelect';
import PopupBanner from './PopupBanner';
import TeacherTrainingLMS from './TeacherTrainingLMS';

// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * Lấy tên hiển thị cho học viên/giảng viên.
 * Nếu `name` toàn là số (ID cũ) → fallback sang email, phone, hoặc ID cuối.
 */
const getDisplayName = (person) => {
  if (!person) return 'Không rõ';
  const name = person.name || '';
  if (name && !/^\d{5,}$/.test(name)) return name;
  return person.email || person.phone || person.zalo || `HV-${String(person.id || person._id || '').slice(-4)}`;
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const ScheduleModal = ({ schedule, students, onClose, onSubmit }) => {
  const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const getDayOfWeek = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return DAY_NAMES[d.getDay()] || 'Thứ 2';
  };

  const initDate = schedule?.date || new Date().toISOString().split('T')[0];
  const firstStudentId = students[0]?.id || students[0]?._id || '';
  const [form, setForm] = useState({
    studentId: schedule?.studentId || String(firstStudentId),
    date: initDate,
    startTime: '19:30',
    endTime: '21:00',
    dayOfWeek: getDayOfWeek(initDate),
    topic: schedule?.topic || schedule?.note || '',
    course: students[0]?.course || '',
    sessionNumber: 1,
    ...(schedule ? { ...schedule, studentId: String(schedule.studentId || firstStudentId) } : {}),
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'studentId') {
      const s = students.find(item => String(item.id || item._id) === String(value));
      setForm({ ...form, studentId: String(value), course: s?.course || '' });
    } else if (name === 'date') {
      setForm({ ...form, date: value, dayOfWeek: getDayOfWeek(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><Calendar size={18}/> {(schedule?.id || schedule?._id) ? 'Cập nhật lịch học' : 'Xếp lịch học mới'}</h3>
          <button onClick={onClose}><X size={20}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Chọn học viên</label>
            <select name="studentId" value={form.studentId} onChange={handleChange} className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none">
              {students.map(s => {
                const sid = String(s.id || s._id || '');
                const displayName = (s.name && !/^\d{5,}$/.test(s.name)) ? s.name : (s.email || s.phone || `HV-${sid.slice(-4)}`);
                return <option key={sid} value={sid}>{displayName} ({s.course})</option>;
              })}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Ngày học (Ngày / Tháng / Năm)</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={parseInt(form.date.split('-')[2])} onChange={(e) => {
                const parts = form.date.split('-');
                const newDate = `${parts[0]}-${parts[1]}-${String(e.target.value).padStart(2,'0')}`;
                setForm({...form, date: newDate, dayOfWeek: getDayOfWeek(newDate)});
              }} className="bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none text-center">
                {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={parseInt(form.date.split('-')[1])} onChange={(e) => {
                const parts = form.date.split('-');
                const newDate = `${parts[0]}-${String(e.target.value).padStart(2,'0')}-${parts[2]}`;
                setForm({...form, date: newDate, dayOfWeek: getDayOfWeek(newDate)});
              }} className="bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none text-center">
                {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}
              </select>
              <select value={parseInt(form.date.split('-')[0])} onChange={(e) => {
                const parts = form.date.split('-');
                const newDate = `${e.target.value}-${parts[1]}-${parts[2]}`;
                setForm({...form, date: newDate, dayOfWeek: getDayOfWeek(newDate)});
              }} className="bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none text-center">
                {[2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-blue-500 font-semibold mt-1.5 text-center">
              📅 {form.dayOfWeek}, ngày {parseInt(form.date.split('-')[2])}/{parseInt(form.date.split('-')[1])}/{form.date.split('-')[0]}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Bắt đầu</label>
              <input type="time" name="startTime" value={form.startTime} onChange={handleChange} className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Kết thúc</label>
              <input type="time" name="endTime" value={form.endTime} onChange={handleChange} className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Chủ đề buổi học</label>
            <input type="text" name="topic" value={form.topic} onChange={handleChange} placeholder="VD: Ôn tập hàm IF, VLOOKUP" className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-sm focus:border-blue-400 outline-none" />
          </div>
          <button onClick={() => onSubmit(form)} className="w-full bg-blue-600 py-4 rounded-2xl text-white font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition">
            {(schedule?.id || schedule?._id) ? 'CẬP NHẬT LỊCH' : 'XẾP LỊCH NGAY'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── STUDENT CARD ─────────────────────────────────────────────────────────
const StudentCard = ({ student, onAttendance, onUpdateLink, onSaveGrade, onUpdateNotes, onLockExam, isDetailed }) => {
  const { showModal } = useModal();
  const [linkInput, setLinkInput] = useState(student.linkHoc);
  const [gradeInput, setGradeInput] = useState(student.lastGrade);
  const [notesInput, setNotesInput] = useState(student.notes || '');
  const [activePanel, setActivePanel] = useState('progress');
  const [linkSaved, setLinkSaved] = useState(false);
  const [gradeSaved, setGradeSaved] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attForm, setAttForm] = useState({ note: 'Đã điểm danh hoàn thành buổi học', grade: student.lastGrade || 0 });

  // ASSIGNMENTS STATE
  const [courseAssignments, setCourseAssignments] = useState([]);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [newAssign, setNewAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingAssign, setEditingAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });

  const done = student.completedSessions != null ? student.completedSessions : (student.totalSessions - student.remainingSessions);
  const progressPct = Math.round((done / student.totalSessions) * 100);
  const isCompleted = student.remainingSessions === 0;

  const todayStr = new Date().toLocaleDateString('vi-VN');
  const hasAttendedToday = (student.grades || []).some(g => g.date === todayStr);
  // 🔐 COOLDOWN 12H: Ưu tiên dùng cờ can_check_in từ Backend (thực tế hơn)
  // Fallback sang hasAttendedToday nếu backend chưa trả về cờ này
  const canCheckIn = student.can_check_in !== undefined ? student.can_check_in : !hasAttendedToday;
  const cooldownHours = student.remaining_cooldown_hours || 0;

  // ⏰ GIỚI HẠN HỦY ĐIỂM DANH 1 TIẾNG
  const lastAttendanceAt = student.last_attendance_at ? new Date(student.last_attendance_at) : null;
  const minsElapsedSinceAttend = lastAttendanceAt ? Math.floor((Date.now() - lastAttendanceAt.getTime()) / 60000) : null;
  const canCancelAttendance = hasAttendedToday && (minsElapsedSinceAttend === null || minsElapsedSinceAttend < 60);
  const cancelTimeLeft = (minsElapsedSinceAttend !== null && minsElapsedSinceAttend < 60)
    ? (60 - minsElapsedSinceAttend)
    : 0;

  useEffect(() => {
    if (activePanel === 'assignments') {
      fetchStudentAssignments();
    }
  }, [activePanel, student.id, student.course]);

  const fetchStudentAssignments = async () => {
    setLoadingAssign(true);
    try {
      const res = await api.assignments.getByCourse(student.course);
      if (res.success) {
        setCourseAssignments(res.data);
      }
    } catch (e) { void 0 }
    setLoadingAssign(false);
  };

  const handleCreateAssign = async () => {
    if (!newAssign.title || !newAssign.deadline) return;
    try {
      const res = await api.assignments.create({
        ...newAssign,
        courseId: student.course,
        teacherId: student.teacherId || 'current'
      });
      if (res.success) {
        setShowAddAssign(false);
        setNewAssign({ title: '', deadline: '', fileUrl: '', description: '' });
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const handleEditAssign = (assign) => {
    setEditingAssignmentId(assign._id);
    setEditingAssign({
      title: assign.title,
      deadline: assign.deadline ? new Date(assign.deadline).toISOString().slice(0,16) : '',
      fileUrl: assign.fileUrl || '',
      description: assign.description || ''
    });
  };

  const handleUpdateAssign = async () => {
    if (!editingAssign.title || !editingAssign.deadline) return;
    try {
      const res = await api.assignments.update(editingAssignmentId, editingAssign);
      if (res.success) {
        setEditingAssignmentId(null);
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const handleDeleteAssign = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa bài tập này?")) return;
    try {
      const res = await api.assignments.delete(id);
      if (res.success) {
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const handleAssignmentUpload = async (e, type = 'new') => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("File đính kèm quá lớn. Xin vui lòng giới hạn dưới 3MB!");
      e.target.value = '';
      return;
    }
    try {
      const res = await api.assignments.uploadFile(file);
      if (res.success) {
        if (type === 'new') setNewAssign(prev => ({...prev, fileUrl: res.fileUrl}));
        else setEditingAssign(prev => ({...prev, fileUrl: res.fileUrl}));
      } else {
        alert(res.message || "Lỗi khi tải file lên");
      }
    } catch(err) {
      alert("Lỗi mạng khi tải file");
    }
    e.target.value = '';
  };

  const handleUndoAttendance = async () => {
    const sid = student._id || student.id;

    // FE guard: kiểm tra trước khi call API
    if (minsElapsedSinceAttend !== null && minsElapsedSinceAttend >= 60) {
      showModal({ title: 'Không thể hủy', content: `Đã quá 1 tiếng kể từ lúc điểm danh (${minsElapsedSinceAttend} phút). Không thể hủy nữa.`, type: 'error' });
      return;
    }

    showModal({
      title: 'Hủy điểm danh hôm nay',
      content: `Xác nhận hủy điểm danh hôm nay của "${student.name || sid}"? Số buổi đã học sẽ giảm 1.${cancelTimeLeft > 0 ? `\n⏰ Còn ${cancelTimeLeft} phút để hủy.` : ''}`,
      type: 'warning',
      confirmText: 'XÁC NHẬN HỦY',
      onConfirm: async () => {
        try {
          const res = await api.students.resetTodayAttendance(sid);
          if (res.success) {
            window.location.reload();
          } else if (res.code === 'CANCEL_TIMEOUT') {
            showModal({ title: '⏰ Hết thời gian hủy', content: res.message, type: 'error' });
          } else {
            showModal({ title: 'Lỗi', content: res.message || 'Lỗi khi hủy điểm danh', type: 'error' });
          }
        } catch (e) {
          showModal({ title: 'Lỗi', content: 'Lỗi kết nối server', type: 'error' });
        }
      }
    });
  };

  const handleLinkSave = () => {
    onUpdateLink(student._id || student.id, linkInput);
    setLinkSaved(true); setTimeout(() => setLinkSaved(false), 2000);
  };

  const handleGradeSave = () => {
    onSaveGrade(student._id || student.id, Number(gradeInput));
    setGradeSaved(true); setTimeout(() => setGradeSaved(false), 2000);
  };

  const panels = [
    { key: 'progress', icon: Activity, label: 'TIẾN ĐỘ' },
    { key: 'assignments', icon: BookOpen, label: 'BÀI TẬP' },
    { key: 'link', icon: Video, label: 'LINK HỌC' },
    { key: 'grade', icon: Award, label: 'ĐÁNH GIÁ' },
  ];

  if (isDetailed) {
    return (
      <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-900/5 border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-500">
        {/* Header - Dark Theme */}
        <div className="bg-[#1e293b] px-10 py-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
             <div className="flex items-center gap-6">
                <div className={`w-20 h-20 ${student.color} rounded-[28px] flex items-center justify-center text-white font-black text-2xl shadow-2xl border-4 border-white/10`}>
                  {student.avatar}
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight uppercase">{getDisplayName(student)}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                     <span className="text-slate-400 text-sm font-bold">{student.course} · {student.age} tuổi</span>
                     <span className="px-3 py-0.5 rounded-lg text-[10px] font-black tracking-widest bg-white/10 text-slate-300 border border-white/5 uppercase">
                        {student.learningMode || 'OFFLINE'}
                     </span>
                  </div>
                </div>
             </div>
             
             <div className="flex items-center gap-3">
                <span className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${
                  isCompleted ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                }`}>
                  {isCompleted ? 'Hoàn thành' : 'Đang học'}
                </span>
                <button 
                  onClick={() => window.open(`http://zalo.me/${student.zalo || student.phone}`, '_blank')}
                  className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center justify-center transition-all border border-white/5"
                  title="Gửi tin nhắn"
                >
                  <MessageSquare size={20} />
                </button>
                {onLockExam && (
                  <button
                    onClick={() => {
                        showModal({ 
                            title: 'Xác nhận ĐÁNH TRƯỢT', 
                            content: `Hành động này sẽ KHOÁ TRUY CẬP PHÒNG THI của ${getDisplayName(student)} ngay lập tức.`, 
                            type: 'warning',
                            confirmText: 'ĐÁNH TRƯỢT NGAY',
                            onConfirm: () => onLockExam(student)
                        });
                    }}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black px-5 py-3 rounded-2xl transition-all shadow-lg shadow-red-900/40 uppercase tracking-widest"
                  >
                    <XCircle size={16} /> ĐÁNH TRƯỢT
                  </button>
                )}
             </div>
          </div>
          
          {/* Progress Bar inside Header */}
          <div className="mt-8 pt-6 border-t border-white/5">
             <div className="flex justify-between items-center mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
                <span>Tiến độ khóa học</span>
                <span className="text-white">{done}/{student.totalSessions} buổi ({progressPct}%)</span>
             </div>
             <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5 shadow-inner">
                <div className={`h-full rounded-full bg-blue-500 shadow-lg shadow-blue-500/50 transition-all duration-[1500ms] ease-out`}
                  style={{ width: `${progressPct}%` }} />
             </div>
          </div>
        </div>

        {/* Tabs - Material Design Style */}
        <div className="flex px-8 bg-white border-b border-gray-50">
          {panels.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setActivePanel(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-5 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                activePanel === key ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}>
              <Icon size={14} /> {label}
              {activePanel === key && (
                <div className="absolute bottom-0 left-4 right-4 h-1 bg-blue-600 rounded-t-full shadow-[0_-2px_6px_rgba(37,99,235,0.4)]" />
              )}
            </button>
          ))}
        </div>

        {/* Action Content */}
        <div className="p-10 space-y-8">
           {activePanel === 'progress' && (
              <div className="space-y-8 animate-in fade-in duration-500">
                 {/* Stat Boxes */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-blue-50/70 border border-blue-100 rounded-[32px] p-6 text-center transform hover:scale-105 transition-all">
                       <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Đã học</p>
                       <h4 className="text-4xl font-black text-blue-700 leading-none">{done}</h4>
                       <p className="text-[10px] font-bold text-blue-300 mt-1 uppercase">buổi</p>
                    </div>
                    <div className={`border rounded-[32px] p-6 text-center transform hover:scale-105 transition-all ${isCompleted ? 'bg-green-50/70 border-green-100' : 'bg-orange-50/70 border-orange-100'}`}>
                       <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isCompleted ? 'text-green-400' : 'text-orange-400'}`}>Còn lại</p>
                       <h4 className={`text-4xl font-black leading-none ${isCompleted ? 'text-green-700' : 'text-orange-700'}`}>{student.remainingSessions}</h4>
                       <p className={`text-[10px] font-bold mt-1 uppercase ${isCompleted ? 'text-green-300' : 'text-orange-300'}`}>buổi</p>
                    </div>
                    <div className="bg-purple-50/70 border border-purple-100 rounded-[32px] p-6 text-center transform hover:scale-105 transition-all">
                       <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Điểm TB</p>
                       <div className="flex items-center justify-center gap-1">
                          <h4 className="text-4xl font-black text-purple-700 leading-none">{student.lastGrade || 0}</h4>
                          <span className="text-lg font-black text-purple-300">/ 10</span>
                       </div>
                       <p className="text-[10px] font-bold text-purple-300 mt-1 uppercase">Đánh giá chung</p>
                    </div>
                 </div>

                 {/* === 2-COLUMN LAYOUT: Điểm danh | Hủy điểm danh === */}
                 <div className="grid grid-cols-2 gap-4">
                   {/* CỘT TRÁI: Nút ĐIỂM DANH */}
                   <button 
                     onClick={() => {
                       if (!canCheckIn && !isCompleted) return;
                       const tGrade = (student.grades || []).find(g => g.date === todayStr);
                       setAttForm({ note: tGrade?.note || 'Đã điểm danh hoàn thành buổi học', grade: tGrade?.grade ?? (student.lastGrade || 0) });
                       setShowAttendanceModal(true);
                     }} 
                     disabled={isCompleted || !canCheckIn}
                     title={!canCheckIn ? `Đã điểm danh. Mở khóa sau ${cooldownHours} tiếng.` : 'Bấm để điểm danh buổi học hôm nay'}
                     className={`py-5 rounded-3xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl ${
                       isCompleted 
                         ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-gray-200'
                       : !canCheckIn
                         ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50 border-2 border-gray-200 pointer-events-none select-none'
                         : 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-green-200 shadow-green-100 active:scale-[0.97]'
                     }`}
                   >
                     <CheckCircle size={20} />
                     <span className="text-xs leading-tight text-center">
                       {isCompleted 
                         ? 'HOÀN THÀNH'
                         : !canCheckIn
                           ? (cooldownHours > 0 ? `CHỜ ${cooldownHours}H` : 'ĐÃ ĐIỂM DANH')
                           : 'ĐIỂM DANH'}
                     </span>
                   </button>

                   {/* CỘT PHẢI: Nút HỦY ĐIỂM DANH — giới hạn 1 tiếng */}
                   <button
                     onClick={() => { if (canCancelAttendance) handleUndoAttendance(); }}
                     disabled={!canCancelAttendance || isCompleted}
                     title={
                       !hasAttendedToday ? 'Chưa điểm danh hôm nay'
                       : !canCancelAttendance ? `Đã quá 1 tiếng, không thể hủy (${minsElapsedSinceAttend} phút trước)`
                       : `Còn ${cancelTimeLeft} phút để hủy. Nhấn để hủy điểm danh hôm nay`
                     }
                     className={`py-5 rounded-3xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all border-2 ${
                       canCancelAttendance && !isCompleted
                         ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100 active:scale-[0.97] shadow-sm cursor-pointer'
                         : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed opacity-40 pointer-events-none select-none'
                     }`}
                   >
                     <X size={20} />
                     <span className="text-xs leading-tight text-center">
                       {canCancelAttendance && cancelTimeLeft > 0
                         ? <>{`HỦY`}<br/>{`(${cancelTimeLeft}p)`}</>
                         : <>HỦY<br/>ĐIỂM DANH</>}
                     </span>
                   </button>
                 </div>

                 {/* Notes Area */}
                 <div className="bg-gray-50/50 rounded-3xl p-6 border border-gray-100">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                       <FileText size={14} /> Ghi chú học viên
                    </label>
                    <textarea 
                       value={notesInput} onChange={e => setNotesInput(e.target.value)}
                       onBlur={() => onUpdateNotes((student._id || student.id), notesInput)}
                       placeholder="Nhận xét cá nhân, ghi nhận đặc biệt về học viên này..."
                       className="w-full bg-white border border-gray-200 rounded-2xl p-5 text-sm font-medium focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none shadow-inner"
                       rows={4}
                    />
                 </div>
              </div>
           )}

           {activePanel === 'link' && (
              <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                 <div className="bg-indigo-50 border border-indigo-100 rounded-[40px] p-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                    <div className="flex items-center gap-4 mb-6">
                       <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                          <Video size={24} />
                       </div>
                       <div>
                          <h3 className="text-xl font-black text-indigo-900">Link học trực tuyến</h3>
                          <p className="text-xs font-bold text-indigo-400">Tự động đồng bộ hóa với Dashboard của học viên</p>
                       </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                       <div className="flex-1 relative">
                          <input 
                            type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                            className="w-full bg-white border-2 border-indigo-100 rounded-2xl px-6 py-4 text-sm font-bold text-indigo-700 focus:border-indigo-500 outline-none transition-all shadow-sm"
                            placeholder="Nhập link Google Meet / Zoom..."
                          />
                       </div>
                       <button 
                         onClick={handleLinkSave}
                         className={`px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg ${
                            linkSaved ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
                         }`}
                       >
                         {linkSaved ? 'ĐÃ LƯU ✓' : 'CẬP NHẬT'}
                       </button>
                    </div>
                 </div>
              </div>
           )}

            {activePanel === 'assignments' && (
              <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen size={14} /> Danh sách bài tập được giao
                  </h4>
                  <button 
                    onClick={() => setShowAddAssign(!showAddAssign)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all flex items-center gap-1.5"
                  >
                    {showAddAssign ? <X size={14} /> : <Plus size={14} />} {showAddAssign ? 'HỦY' : 'GIAO BÀI TẬP'}
                  </button>
                </div>

                {showAddAssign && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-[32px] p-6 space-y-4 shadow-inner animate-in zoom-in-95">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Tiêu đề bài tập</label>
                        <input type="text" value={newAssign.title} onChange={e => setNewAssign({...newAssign, title: e.target.value})}
                          className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="VD: Homework Buổi 1" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Hạn nộp (Deadline)</label>
                        <input type="datetime-local" value={newAssign.deadline} onChange={e => setNewAssign({...newAssign, deadline: e.target.value})}
                          className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Tài liệu đính kèm (Link Drive/File hoặc Tải lên)</label>
                        <div className="flex items-center gap-2">
                          <input type="text" value={newAssign.fileUrl} onChange={e => setNewAssign({...newAssign, fileUrl: e.target.value})}
                            className="flex-1 bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="Dán link Drive/File..." />
                          <label className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-3 rounded-2xl cursor-pointer transition flex items-center justify-center" title="Tải file lên (Tối đa 3MB)">
                            <Upload size={18} />
                            <input type="file" className="hidden" onChange={(e) => handleAssignmentUpload(e, 'new')} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" />
                          </label>
                        </div>
                        <p className="text-[9px] text-gray-400 font-medium italic mt-1.5 ml-1">* Cho phép: PDF, Word, Excel, ZIP, RAR. Tối đa 3MB.</p>
                      </div>
                      <button onClick={handleCreateAssign} className="md:col-span-2 bg-indigo-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-100">GỬI BÀI TẬP CHO HỌC VIÊN</button>
                    </div>
                  </div>
                )}

                {loadingAssign ? (
                   <div className="py-20 text-center animate-pulse text-xs font-black text-slate-300 uppercase tracking-[4px]">Đang tải dữ liệu...</div>
                ) : (
                  <div className="space-y-4">
                    {courseAssignments.map(assign => {
                      const submission = assign.submissions?.find(s => String(s.studentId?._id || s.studentId) === String(student.id || student._id));
                      const isSubmitted = !!submission;
                      const isGraded = submission?.status === 'graded';
                      
                      return editingAssignmentId === assign._id ? (
                        <div key={`edit-${assign._id}`} className="bg-indigo-50 border border-indigo-200 rounded-[32px] p-6 space-y-4 shadow-inner animate-in zoom-in-95 relative z-10 transition-all">
                          <div className="flex items-center justify-between">
                             <h4 className="text-[11px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">Chỉnh sửa Bài tập</h4>
                             <button onClick={() => setEditingAssignmentId(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16}/></button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Tiêu đề bài tập</label>
                              <input type="text" value={editingAssign.title} onChange={e => setEditingAssign({...editingAssign, title: e.target.value})}
                                className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none"/>
                            </div>
                            <div>
                              <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Hạn nộp (Deadline)</label>
                              <input type="datetime-local" value={editingAssign.deadline} onChange={e => setEditingAssign({...editingAssign, deadline: e.target.value})}
                                className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none text-center" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block">Tài liệu đính kèm (Link Drive/File hoặc Tải lên)</label>
                              <div className="flex items-center gap-2">
                                <input type="text" value={editingAssign.fileUrl} onChange={e => setEditingAssign({...editingAssign, fileUrl: e.target.value})}
                                  className="flex-1 bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="Dán link Drive/File..." />
                                <label className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-3 rounded-2xl cursor-pointer transition flex items-center justify-center" title="Tải file lên (Tối đa 3MB)">
                                  <Upload size={18} />
                                  <input type="file" className="hidden" onChange={(e) => handleAssignmentUpload(e, 'edit')} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" />
                                </label>
                              </div>
                              <p className="text-[9px] text-gray-400 font-medium italic mt-1.5 ml-1">* Cho phép: PDF, Word, Excel, ZIP, RAR. Tối đa 3MB.</p>
                            </div>
                            <button onClick={handleUpdateAssign} className="md:col-span-2 bg-indigo-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-100">CẬP NHẬT BÀI TẬP</button>
                          </div>
                        </div>
                      ) : (
                        <div key={assign._id} className="bg-white rounded-[40px] p-6 border border-gray-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-slate-200/50 transition-all group relative overflow-hidden">
                          {isGraded && <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full translate-x-12 -translate-y-12" />}
                          <div className="flex items-start justify-between gap-6 relative z-10">
                            <div className="flex-1 min-w-0">
                              <h5 className="font-black text-slate-800 text-base mb-2 group-hover:text-indigo-600 transition-colors uppercase leading-tight truncate pr-4">{assign.title}</h5>
                              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                 <p className="text-[10px] font-black text-slate-400 flex items-center gap-1.5"><Clock size={12} className="text-orange-400"/> HẠN: {new Date(assign.deadline).toLocaleDateString('vi-VN')}</p>
                                 {assign.fileUrl && (
                                   <a href={assign.fileUrl.startsWith('http') ? assign.fileUrl : `https://${assign.fileUrl}`} target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1.5 bg-blue-50 px-3 py-1 rounded-lg">
                                     <Link2 size={12} /> XEM ĐỀ BÀI
                                   </a>
                                 )}
                                 <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEditAssign(assign)} title="Sửa bài tập" className="text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 hover:bg-indigo-50 p-1.5 rounded-lg">
                                      <Edit3 size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteAssign(assign._id)} title="Xóa bài tập" className="text-slate-400 hover:text-red-500 transition-colors bg-slate-50 hover:bg-red-50 p-1.5 rounded-lg">
                                      <Trash2 size={14} />
                                    </button>
                                 </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-3 font-black flex-shrink-0">
                              {isSubmitted ? (
                                <div className={`px-4 py-1.5 rounded-2xl text-[10px] uppercase tracking-widest flex items-center gap-2 ${isGraded ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isGraded ? <Check size={12}/> : <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                                  {isGraded ? `KHÁ: ${submission.grade}/10` : 'ĐÃ NỘP BÀI'}
                                </div>
                              ) : (
                                <span className="px-4 py-1.5 rounded-2xl text-[10px] uppercase tracking-widest bg-gray-50 text-slate-300">CHƯA NỘP</span>
                              )}
                              {isSubmitted && !isGraded && (
                                <button onClick={() => navigate('/teacher/assignments')} className="text-[10px] text-indigo-600 hover:text-indigo-800 underline decoration-2 underline-offset-4">CHẤM BÀI NGAY &rarr;</button>
                              )}
                              {isGraded && submission.teacherFeedback && (
                                <p className="text-[9px] text-slate-400 italic max-w-[150px] text-right line-clamp-1">"{submission.teacherFeedback}"</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {courseAssignments.length === 0 && !showAddAssign && (
                      <div className="py-24 text-center bg-gray-50/50 rounded-[40px] border-4 border-dashed border-white">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-200 shadow-sm">
                           <BookOpen size={28} />
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-10 leading-relaxed">Chưa có bài tập nào được giao<br/>cho lộ trình này</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {activePanel === 'grade' && (
              <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
                 <div className="bg-amber-50 border border-amber-100 rounded-[40px] p-10 flex flex-col md:flex-row items-center gap-10">
                    <div className="flex-1 space-y-4">
                       <div className="flex items-center gap-4 mb-2">
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                             <Award size={24} />
                          </div>
                          <div>
                             <h3 className="text-xl font-black text-amber-900">Đánh giá quá trình</h3>
                             <p className="text-xs font-bold text-amber-500">Cập nhật điểm trung bình dựa trên bài tập</p>
                          </div>
                       </div>
                       <input 
                          type="number" min="0" max="10" step="0.5" 
                          value={gradeInput} onChange={e => setGradeInput(e.target.value)}
                          className="w-24 bg-white border-2 border-amber-200 rounded-2xl p-4 text-3xl font-black text-amber-700 text-center focus:border-amber-500 outline-none"
                       />
                       <p className="text-xs font-bold text-amber-400 italic">* Điểm số sẽ được hiển thị công khai trên học bạ</p>
                       <button 
                         onClick={handleGradeSave}
                         className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 transition shadow-lg shadow-amber-100"
                       >
                         LƯU KẾT QUẢ ĐÁNH GIÁ
                       </button>
                    </div>
                    <div className="w-40 h-40 bg-white rounded-full border-8 border-amber-100 flex flex-col items-center justify-center shadow-xl">
                       <span className="text-[10px] font-black text-amber-300 uppercase leading-none mb-1">Xếp loại</span>
                       <span className="text-6xl font-black text-amber-600">
                          {gradeInput >= 8.5 ? 'A' : gradeInput >= 7 ? 'B' : gradeInput >= 5 ? 'C' : 'D'}
                       </span>
                    </div>
                 </div>
              </div>
           )}
        </div>
        
        {/* Attendance Modal - Added to Detailed View */}
        {showAttendanceModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white">
              <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <CheckCircle size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh & Chấm điểm</h3>
                    <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">{student.course}</p>
                  </div>
                </div>
                <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-white/10 p-2 rounded-2xl transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="p-10 space-y-6">
                <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
                  <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Học viên</p>
                  <p className="text-lg font-black text-emerald-600">{getDisplayName(student)}</p>
                  <p className="text-[10px] font-bold text-emerald-400 mt-2">Tiến độ hiện tại: {done}/{student.totalSessions} buổi</p>
                </div>
                
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3">Đánh giá buổi học (0-10)</label>
                  <div className="relative">
                    <input 
                      type="number" min="0" max="10" step="0.5" 
                      value={attForm.grade}
                      onChange={(e) => setAttForm({ ...attForm, grade: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-3xl font-black text-slate-700 outline-none transition-all"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 text-lg font-black">/ 10</div>
                  </div>
                </div>

                <div>
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3">Ghi chú nhanh</label>
                   <textarea 
                     value={attForm.note}
                     onChange={(e) => setAttForm({ ...attForm, note: e.target.value })}
                     placeholder="Ví dụ: Học tốt, nộp bài đầy đủ..."
                     className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none transition-all resize-none"
                     rows={3}
                   />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setShowAttendanceModal(false)}
                    className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={() => {
                      onAttendance((student._id || student.id), attForm.note, Number(attForm.grade));
                      setShowAttendanceModal(false);
                    }}
                    className="flex-[2] py-4 text-white font-black text-xs uppercase tracking-widest bg-gradient-to-r from-emerald-600 to-green-500 rounded-2xl shadow-lg shadow-green-100 hover:shadow-green-200 transition-all active:scale-95"
                  >
                    Xác nhận Điểm danh
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // STANDARD COMPACT VIEW (For Dashboard/List)
  return (
    <React.Fragment>
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${student.color} rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
              {student.avatar}
            </div>
            <div>
              <p className="text-white font-bold text-lg tracking-wide">{getDisplayName(student)}</p>
              <p className="text-slate-300 text-xs mt-0.5 flex items-center gap-2">
                {student.course} · {student.age} tuổi
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${student.learningMode === 'ONLINE' ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-slate-300'}`}>
                  {student.learningMode === 'ONLINE' ? '🌐 ONLINE' : '🏢 OFFLINE'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
            }`}>{isCompleted ? '✓ Hoàn thành' : student.status}</span>
            <a href={`https://zalo.me/${student.zalo}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all">
              <MessageSquare size={14} /> {student.zalo}
            </a>
            {onLockExam && (
              <button
                onClick={() => {
                    showModal({ 
                        title: 'Xác nhận ĐÁNH TRƯỢT', 
                        content: `Hành động này sẽ KHOÁ TRUY CẬP PHÒNG THI của ${getDisplayName(student)} ngay lập tức.`, 
                        type: 'warning',
                        confirmText: 'XÁC NHẬN',
                        onConfirm: () => onLockExam(student)
                    });
                }}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black px-3 py-2 rounded-xl transition-all shadow-lg shadow-red-900/30"
              >
                <XCircle size={14} /> ĐÁNH TRƯỢT
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1.5 text-xs">
            <span className="text-slate-400">Tiến độ khóa học</span>
            <span className="text-white font-bold">{done}/{student.totalSessions} buổi ({progressPct}%)</span>
          </div>
          <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${
              progressPct >= 70 ? 'bg-green-400' : progressPct >= 40 ? 'bg-yellow-400' : 'bg-blue-400'
            }`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {panels.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActivePanel(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all ${
              activePanel === key ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Panel Content (Standard View) */}
      <div className="p-6">
        {activePanel === 'progress' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100">
                <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">Đã học</p>
                <p className="text-3xl font-black text-blue-700">{done}</p>
                <p className="text-xs text-blue-400">buổi</p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${isCompleted ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isCompleted ? 'text-green-500' : 'text-orange-500'}`}>Còn lại</p>
                <p className={`text-3xl font-black ${isCompleted ? 'text-green-700' : 'text-orange-700'}`}>{student.remainingSessions}</p>
                <p className={`text-xs ${isCompleted ? 'text-green-400' : 'text-orange-400'}`}>buổi</p>
              </div>
              <div className="bg-purple-50 rounded-2xl p-4 text-center border border-purple-100">
                <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide mb-1">Điểm TB</p>
                <p className="text-3xl font-black text-purple-700">{student.lastGrade}</p>
                <p className="text-xs text-purple-400">/ 10</p>
              </div>
            </div>
            {/* === 2-COLUMN LAYOUT: Điểm danh | Hủy điểm danh === */}
            <div className="grid grid-cols-2 gap-3">
              {/* CỘT TRÁI: Nút ĐIỂM DANH */}
              <button onClick={() => {
                  if (!canCheckIn && !isCompleted) return;
                  const tGrade = (student.grades || []).find(g => g.date === todayStr);
                  setAttForm({ note: tGrade?.note || 'Đã điểm danh hoàn thành buổi học', grade: tGrade?.grade ?? (student.lastGrade || 0) });
                  setShowAttendanceModal(true);
                }} disabled={isCompleted || !canCheckIn}
                title={!canCheckIn ? `Đã điểm danh. Mở khóa sau ${cooldownHours} tiếng.` : 'Bấm để điểm danh'}
                className={`py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                  isCompleted 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : !canCheckIn
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50 pointer-events-none select-none border-2 border-gray-200'
                    : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white hover:shadow-green-200 shadow-green-100 active:scale-[0.97]'
                }`}>
                <CheckCircle size={18} />
                <span className="text-xs text-center leading-tight">
                  {isCompleted 
                    ? 'HOÀN THÀNH'
                    : !canCheckIn
                      ? (cooldownHours > 0 ? `CHỜ ${cooldownHours}H` : 'ĐÃ ĐIỂM DANH')
                      : 'ĐIỂM DANH'}
                </span>
              </button>

              {/* CỘT PHẢI: Nút HỦY */}
              <button
                onClick={() => { if (hasAttendedToday) handleUndoAttendance(); }}
                disabled={!hasAttendedToday || isCompleted}
                title={hasAttendedToday ? 'Hủy điểm danh hôm nay (sửa lỗi)' : 'Chưa điểm danh hôm nay'}
                className={`py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all border-2 ${
                  hasAttendedToday && !isCompleted
                    ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100 active:scale-[0.97] cursor-pointer shadow-sm'
                    : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed opacity-40 pointer-events-none select-none'
                }`}>
                <X size={18} />
                <span className="text-xs text-center leading-tight">HỦY<br/>ĐIỂM DANH</span>
              </button>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2 font-black uppercase text-[10px] text-gray-400 tracking-widest">📝 Ghi chú học viên</label>
              <textarea value={notesInput} onChange={e => setNotesInput(e.target.value)}
                onBlur={() => onUpdateNotes(student._id || student.id, notesInput)} rows={3}
                placeholder="Nhận xét, ghi chú về học viên..."
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:border-blue-400 outline-none" />
            </div>
          </div>
        )}

        {activePanel === 'link' && (
          <div className="space-y-5">
            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
               <div className="flex items-center gap-2 mb-3">
                 <Video size={18} className="text-blue-600" />
                 <h3 className="font-bold text-blue-800 text-sm">Link học trực tuyến</h3>
               </div>
               <p className="text-[10px] text-blue-500 mb-4 font-bold uppercase">Cập nhật link buổi học mới tại đây</p>
               <div className="flex gap-2">
                 <input type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                   className="flex-1 border-2 border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none"
                   placeholder="Dán link họp..." />
                 <button onClick={handleLinkSave}
                   className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${linkSaved ? 'bg-green-500 text-white' : 'bg-slate-800 text-white'}`}>
                   Lưu
                 </button>
               </div>
            </div>
          </div>
        )}

        {activePanel === 'grade' && (
          <div className="space-y-5">
             <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Điểm trung bình</p>
                  <h4 className="text-3xl font-black text-orange-700">{student.lastGrade || 0}</h4>
                </div>
                <button onClick={() => setActivePanel('grade')} className="bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Cập nhật điểm</button>
             </div>
          </div>
        )}
      </div>
    </div>

      {/* === DUY NHẤT 1 MODAL ĐIỂM DANH (dùng chung cho cả 2 view) === */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white">
            <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh &amp; Chấm điểm</h3>
                  <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">{student.course}</p>
                </div>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-white/10 p-2 rounded-2xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-10 space-y-6">
              <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
                <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Học viên</p>
                <p className="text-lg font-black text-emerald-600">{getDisplayName(student)}</p>
                <p className="text-[10px] font-bold text-emerald-400 mt-2">Tiến độ hiện tại: {done}/{student.totalSessions} buổi</p>
              </div>
              
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3">Đánh giá buổi học (0-10)</label>
                <div className="relative">
                  <input 
                    type="number" min="0" max="10" step="0.5" 
                    value={attForm.grade}
                    onChange={(e) => setAttForm({ ...attForm, grade: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-3xl font-black text-slate-700 outline-none transition-all"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 text-lg font-black">/ 10</div>
                </div>
              </div>

              <div>
                 <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-3">Ghi chú nhanh</label>
                 <textarea 
                   value={attForm.note}
                   onChange={(e) => setAttForm({ ...attForm, note: e.target.value })}
                   placeholder="Ví dụ: Học tốt, nộp bài đầy đủ..."
                   className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm font-semibold text-slate-700 outline-none transition-all resize-none h-24"
                 />
              </div>

            </div>

            <div className="bg-slate-50 px-8 py-6 flex gap-4 flex-shrink-0">
              <button 
                onClick={closeModal}
                className="flex-[1] py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                disabled={submitting}
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSubmit}
                disabled={submitting || (attForm._originalData?.status === 'completed' && !activeTab)}
                className="flex-[2] py-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {attForm._originalData?.status === 'completed' ? 'Cập nhật' : 'Xác nhận Điểm danh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
};

// ─── MONTHLY CALENDAR (Upgraded) ───────────────────────────────────────────────────

const STATUS_COLORS = {
  completed: {
    cell: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    label: '✓ Hoàn thành',
  },
  scheduled: {
    cell: 'bg-amber-50 border-amber-200 text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-400',
    label: '● Sắp tới',
  },
  cancelled: {
    cell: 'bg-red-50 border-red-200 text-red-400',
    badge: 'bg-red-100 text-red-500',
    dot: 'bg-red-400',
    label: '✗ Đã hủy',
  },
};

const MonthlyCalendar = ({ schedules, onEditSchedule, onAddSchedule, onCancelSchedule }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null); // schedule đang muốn hủy
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
    'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();
  today.setHours(0, 0, 0, 0);

  const isPast = (day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };
  const isToday = (day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  // Group schedules by date
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const d = new Date(s.date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(s);
      }
    });
    return map;
  }, [schedules, month, year]);

  const selectedSchedules = selectedDay ? (scheduleMap[selectedDay] || []) : [];

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  // Xác định màu sắc đại diện của ngày (priority: completed > scheduled > cancelled)
  const getDayStatus = (daySchs) => {
    if (!daySchs?.length) return null;
    if (daySchs.some(s => s.status === 'completed')) return 'completed';
    if (daySchs.some(s => s.status === 'scheduled')) return 'scheduled';
    if (daySchs.some(s => s.status === 'cancelled')) return 'cancelled';
    return null;
  };

  // Hủy lịch → gọi API cancel
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const token = localStorage.getItem('teacher_access_token') || localStorage.getItem('admin_access_token');
      const res = await fetch(`${API}/api/schedules/${cancelTarget._id || cancelTarget.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (data.success) {
        if (onCancelSchedule) onCancelSchedule(cancelTarget._id || cancelTarget.id, cancelReason);
      } else {
        alert(data.message || 'Lỗi khi hủy lịch');
      }
    } catch (e) {
    }
    setCancelling(false);
    setCancelTarget(null);
    setCancelReason('');
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* ─ CALENDAR GRID ─ */}
      <div className="bg-white rounded-[2rem] shadow-sm border-0 p-3 sm:p-5 w-full xl:w-[420px] flex-shrink-0">
        {/* Header Nav */}
        <div className="px-2 py-4 flex items-center justify-between mb-2">
          <h3 className="font-extrabold text-teal-800 text-base sm:text-lg tracking-wide">
            Lịch theo tháng
          </h3>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 sm:p-2 rounded-xl hover:bg-slate-50 transition text-slate-500 hover:text-slate-800 active:scale-95">
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2 border-2 border-slate-100 rounded-xl px-3 py-1.5 sm:py-2 text-sm font-bold text-slate-700 shadow-sm bg-white">
              <span className="min-w-[90px] sm:min-w-[110px] text-center">tháng {month + 1} {year}</span>
              <Calendar size={14} className="text-slate-400" />
            </div>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 sm:p-2 rounded-xl hover:bg-slate-50 transition text-slate-500 hover:text-slate-800 active:scale-95">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 text-center px-1 border-b border-slate-50 pb-3 mb-3">
          {['CN','T2','T3','T4','T5','T6','T7'].map((d, i) => (
            <div key={d} className={`text-xs font-black uppercase tracking-widest ${i === 0 ? 'text-orange-500' : 'text-slate-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 px-1 gap-y-2 gap-x-1 sm:gap-y-3 sm:gap-x-2">
          {days.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} />;

            const daySchs  = scheduleMap[day] || [];
            const past     = isPast(day);
            const todayDay = isToday(day);
            const selected = selectedDay === day;
            const hasData  = daySchs.length > 0;
            const canAddNew = !past && !hasData;

            // Xác định ngày Chủ Nhật để highlight số
            const isSunday = (idx % 7 === 0);

            return (
              <button
                key={day}
                onClick={() => {
                  if (past && !hasData) return;
                  setSelectedDay(day === selectedDay ? null : day);
                  if (canAddNew && onAddSchedule) onAddSchedule(new Date(year, month, day));
                }}
                title={
                  hasData ? daySchs.map(s => `${s.startTime} - ${s.studentName || s.course}${(s.topic || s.note) ? ` (${s.topic || s.note})` : ''}`).join('\n') 
                  : past ? 'Ngày đã qua, không thể sắp lịch' 
                  : 'Click để sắp lịch hôm này'
                }
                className={`relative w-full h-[3.25rem] sm:h-14 rounded-[1.25rem] flex flex-col items-center justify-center text-sm font-bold transition-all border-2
                  ${
                    selected
                      ? 'bg-teal-50/50 border-teal-600 shadow-sm text-teal-800'
                    : todayDay && !hasData
                      ? 'bg-white border-slate-200 text-slate-800 ring-2 ring-slate-100 ring-offset-2'
                    : past && !hasData
                      ? 'opacity-30 cursor-not-allowed border-transparent text-slate-400'
                    : hasData 
                      ? 'bg-[#B2DFDB]/50 border-transparent hover:bg-[#B2DFDB]/70 text-slate-700'
                    : 'text-slate-600 hover:bg-slate-50 border-transparent hover:border-slate-100 cursor-pointer'
                  }
                `}
              >
                <span className={`${isSunday ? 'text-orange-500' : ''} ${(todayDay && !selected) ? 'text-blue-600 font-black' : ''}`}>
                  {day}
                </span>

                {/* Status dots container - stacked below number */}
                {hasData && (
                  <div className="flex gap-1 mt-0.5 flex-wrap justify-center px-1">
                    {/* Render different color dots depending on status */}
                    {daySchs.filter(s => s.status === 'scheduled').slice(0,2).map(s => (
                      <div key={'s-'+s._id} className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-400 shadow-sm" />
                    ))}
                    {daySchs.filter(s => s.status === 'completed').slice(0,2).map(s => (
                      <div key={'c-'+s._id} className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 shadow-sm" />
                    ))}
                    {daySchs.filter(s => s.status === 'cancelled').slice(0,2).map(s => (
                      <div key={'x-'+s._id} className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-400 shadow-sm" />
                    ))}
                    {daySchs.length > 4 && (
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-slate-400 shadow-sm" />
                    )}
                  </div>
                )}
                
                {/* Quick-add hint on empty future day */}
                {canAddNew && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-white/50 backdrop-blur-[1px] rounded-xl border border-dashed border-teal-300">
                    <Plus size={16} className="text-teal-600" />
                  </div>
                )}
                {/* Diagonal line for full-cancelled days */}
                {!past && !selected && daySchs.length > 0 && daySchs.every(s => s.status === 'cancelled') && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-full" style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(239,68,68,0.15) 4px, rgba(239,68,68,0.15) 5px)' }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-6 pb-4 flex gap-5 text-[10px] text-gray-500 border-t border-gray-50 pt-3">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-400" /> Đã dạy</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-400" /> Sắp tới</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-400" /> Đã hủy</span>
          <span className="flex items-center gap-1.5 text-blue-500"><Plus size={10} /> Click ngày trống để sắp lịch</span>
        </div>
      </div>

      {/* ─ RIGHT COLUMN (Detail Panel & Upcoming) ─ */}
      <div className="flex-1 w-full flex flex-col gap-6">
        
      {/* ─ DETAIL PANEL (khi chọn 1 ngày) Hoặc TRẠNG THÁI TRỐNG ─ */}
      {selectedDay ? (
        <div className="bg-white rounded-[2rem] border-0 shadow-sm overflow-hidden min-h-[300px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-bold text-gray-800 text-sm">
              Lịch ngày {selectedDay}/{month + 1}/{year}
            </h4>
            <button onClick={() => setSelectedDay(null)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          {selectedSchedules.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-400 text-sm mb-3">Không có lịch ngày này.</p>
              {!isPast(selectedDay) && (
                <button
                  onClick={() => { setSelectedDay(null); if (onAddSchedule) onAddSchedule(new Date(year, month, selectedDay)); }}
                  className="text-xs bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-1.5 mx-auto"
                >
                  <Plus size={12} /> Sắp lịch ngày này
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {selectedSchedules.map(s => {
                const past = isPast(selectedDay);
                const isCancellable = !past && s.status === 'scheduled';
                const cfg = STATUS_COLORS[s.status] || STATUS_COLORS.scheduled;
                return (
                  <div key={s._id || s.id} className="px-5 py-4 flex items-center gap-4 group hover:bg-gray-50 transition-colors">
                    {/* Status icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                      {s.status === 'completed' ? <CheckCircle size={16} /> :
                       s.status === 'cancelled' ? <Ban size={16} /> :
                       <Clock size={16} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${s.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {s.studentName || s.course || 'Lịch học'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {s.startTime}{s.endTime ? ` – ${s.endTime}` : ''} &bull; {s.course}
                      </p>
                      {(s.topic || s.note) && (
                        <p className="text-[11px] font-medium text-blue-600 mt-1 truncate border-l-2 border-blue-500 pl-2 bg-blue-50/50 py-0.5 rounded-r">
                          {s.topic || s.note}
                        </p>
                      )}
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-block mt-1 ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {s.status === 'scheduled' && !past && (
                        <button
                          onClick={() => onEditSchedule && onEditSchedule(s)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Sửa lịch"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                      {isCancellable && (
                        <button
                          onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Hủy lịch này"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border-0 shadow-sm min-h-[300px] flex flex-col items-center justify-center text-slate-400 p-8 text-center border-dashed border-2 border-slate-100">
          <div className="w-20 h-20 bg-slate-50 flex items-center justify-center rounded-[1.5rem] mb-4 text-teal-600/20">
            <Calendar size={40} />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">Chưa chọn ngày</h3>
          <p className="text-sm max-w-sm">Vui lòng bấm vào một ngày bất kỳ trên lịch phía trái để xem chi tiết hoặc sắp lịch mới.</p>
        </div>
      )}

      {/* ─ UPCOMING LIST ─ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-700">📅 Sắp tới trong tháng</h4>
          <span className="text-[10px] text-gray-400 font-bold">
            {schedules.filter(s => s.status === 'scheduled' && new Date(s.date) >= today && new Date(s.date).getMonth() === month).length} buổi
          </span>
        </div>
        <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {schedules
            .filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(s => {
              const d = new Date(s.date);
              return (
                <div key={s._id || s.id} className="px-5 py-3 flex items-center gap-3 hover:bg-amber-50/30 transition group">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex flex-col items-center justify-center text-amber-700 flex-shrink-0">
                    <span className="text-[8px] font-bold">{monthNames[d.getMonth()]}</span>
                    <span className="text-sm font-black">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.studentName || s.course}</p>
                    <p className="text-[10px] text-gray-400">{s.startTime} – {s.endTime} &bull; {s.course}</p>
                    {(s.topic || s.note) && (
                      <p className="text-[10px] font-medium text-amber-600 mt-0.5 truncate">
                        📖 {s.topic || s.note}
                      </p>
                    )}
                  </div>
                  {/* Hover cancel button */}
                  {new Date(s.date) >= today && (
                    <button
                      onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="Hủy lịch"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          {schedules.filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month).length === 0 && (
            <div className="px-5 py-6 text-center text-gray-400 text-sm">Không có buổi nào sắp tới.</div>
          )}
        </div>
      </div>

      {/* ─ STATS ROW ─ */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Tổng', value: schedules.filter(s => new Date(s.date).getMonth() === month).length, color: 'bg-blue-50 text-blue-600' },
          { label: 'Đã dạy', value: schedules.filter(s => s.status === 'completed' && new Date(s.date).getMonth() === month).length, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Sắp tới', value: schedules.filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month).length, color: 'bg-amber-50 text-amber-600' },
          { label: 'Đã hủy', value: schedules.filter(s => s.status === 'cancelled' && new Date(s.date).getMonth() === month).length, color: 'bg-red-50 text-red-500' },
        ].map((st, i) => (
          <div key={i} className={`${st.color} rounded-xl p-3 text-center border border-current/10`}>
            <p className="text-xl font-black">{st.value}</p>
            <p className="text-[10px] font-bold uppercase">{st.label}</p>
          </div>
        ))}
      </div>

      </div>

      {/* ─ MODAL HUỶY LịCH ─ */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-600 p-6 text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-black text-base">Hủy lịch dạy</h3>
                <p className="text-red-200 text-xs mt-0.5">{cancelTarget.studentName} • {cancelTarget.course}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Hành động này sẽ <strong>hủy vĩnh viễn</strong> buổi học này và ghi vào nhật ký hệ thống.</p>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Lý do hủy *</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Ví dụ: Học viên xin nghỉ, Giảng viên bận..."
                  className="w-full border-2 border-gray-200 focus:border-red-400 rounded-xl px-4 py-3 text-sm outline-none resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setCancelTarget(null); setCancelReason(''); }}
                  className="flex-1 py-3 text-gray-500 font-bold bg-gray-50 rounded-xl hover:bg-gray-100"
                >Hủy bỏ</button>
                <button
                  onClick={handleConfirmCancel}
                  disabled={!cancelReason.trim() || cancelling}
                  className="flex-[2] py-3 text-white font-bold bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {cancelling ? 'Đang hủy...' : 'Đồng ý Hủy lịch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── TEACHER RATING DISPLAY ─────────────────────────────────────────────────

const TeacherRatingDisplay = ({ rating, RATING_CRITERIA }) => {
  if (!rating || rating.count === 0) return null;

  const StarIcons = ({ count, max = 5 }) => (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={14} className={i < Math.round(count) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
      ))}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-white">
        <h3 className="font-bold text-yellow-800 flex items-center gap-2">
          <Star size={18} className="text-yellow-500 fill-yellow-500" /> Đánh giá từ học viên
        </h3>
      </div>
      <div className="p-6">
        {/* Average */}
        <div className="flex items-center gap-4 mb-6">
          <div className="text-center">
            <p className="text-4xl font-black text-yellow-600">{rating.avg}</p>
            <StarIcons count={rating.avg} />
            <p className="text-[10px] text-gray-400 mt-1">{rating.count} đánh giá</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map(star => {
              const count = rating.ratings.filter(r => Math.round(r.criteria?.stars) === star).length;
              const pct = rating.count > 0 ? (count / rating.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-right text-gray-500">{star} ⭐</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-gray-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Individual reviews */}
        <div className="space-y-3">
          {rating.ratings.map((r, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {r.studentName?.substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{r.studentName}</p>
                    <p className="text-[10px] text-gray-400">{r.date}</p>
                  </div>
                </div>
                <StarIcons count={r.criteria?.stars} />
              </div>
              {/* Criteria tags */}
              {r.criteria && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(r.criteria).map(([cat, key]) => {
                    const catData = RATING_CRITERIA[cat];
                    const opt = catData?.options.find(o => o.key === key);
                    return opt ? (
                      <span key={cat} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        opt.score >= 4 ? 'bg-green-100 text-green-700' : opt.score >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>{catData.label}: {opt.label}</span>
                    ) : null;
                  })}
                </div>
              )}
              {r.comment && <p className="text-xs text-gray-600 italic">"{r.comment}"</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
// ─── VIETNAMESE BANKS LIST ────────────────────────────────────────────────────
const VN_BANKS = [
  'Vietcombank (VCB)', 'VietinBank (CTG)', 'BIDV', 'Agribank',
  'Techcombank (TCB)', 'MB Bank (MBB)', 'ACB', 'VPBank',
  'Sacombank (STB)', 'HDBank', 'TPBank', 'OCB',
  'SHB', 'VIB', 'SeABank', 'LienVietPostBank (LPB)',
  'Eximbank (EIB)', 'MSB (Maritime Bank)', 'BaoViet Bank',
  'NamABank', 'ABBank', 'Bac A Bank', 'GPBank',
  'NCB', 'Saigonbank', 'VietABank', 'PGBank',
  'KienLong Bank', 'VietBank',
];

// ─── TEACHER PROFILE SECTION ─────────────────────────────────────────────────
const TeacherProfileSection = ({ teacherId, currentTeacher }) => {
  const { updateTeacher } = useData();
  const [bankForm, setBankForm] = useState({
    bankName: '',
    bankCode: '',       // bin từ VietQR API
    accountNumber: '',
    accountName: '',
    bankBranch: '',
  });
  const [profileForm, setProfileForm] = useState({
    email: '',
    bio: '',
    specialty: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [editingBank, setEditingBank] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  // Load data from currentTeacher
  useEffect(() => {
    if (currentTeacher) {
      setBankForm({
        bankName: currentTeacher.bankAccount?.bankName || '',
        bankCode: currentTeacher.bankAccount?.bankCode || '',
        accountNumber: currentTeacher.bankAccount?.accountNumber || '',
        accountName: currentTeacher.bankAccount?.accountName || currentTeacher.bankAccount?.accountHolder || '',
        bankBranch: currentTeacher.bankAccount?.bankBranch || '',
      });
      setProfileForm({
        email: currentTeacher.email || '',
        bio: currentTeacher.bio || '',
        specialty: currentTeacher.specialty || '',
        address: currentTeacher.address || '',
      });
    }
  }, [currentTeacher]);

  const handleSaveBank = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const result = await updateTeacher(teacherId, {
        bankAccount: {
          bankName: bankForm.bankName,
          bankCode: bankForm.bankCode,   // lưu mã BIN cho VietQR
          accountNumber: bankForm.accountNumber,
          accountName: bankForm.accountName.toUpperCase(),
          accountHolder: bankForm.accountName.toUpperCase(), // alias
          bankBranch: bankForm.bankBranch,
        },
      });
      if (result && result.success) {
        setSaveMsg('✅ Đã lưu thông tin thanh toán!');
        setEditingBank(false);
      } else {
        setSaveMsg('❌ ' + (result?.message || 'Lỗi khi lưu'));
      }
    } catch (err) {
      setSaveMsg('❌ Lỗi kết nối server');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const result = await updateTeacher(teacherId, profileForm);
      if (result && result.success) {
        setSaveMsg('✅ Đã cập nhật thông tin cá nhân!');
        setEditingProfile(false);
      } else {
        setSaveMsg('❌ ' + (result?.message || 'Lỗi khi lưu'));
      }
    } catch (err) {
      setSaveMsg('❌ Lỗi kết nối server');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 1500);
  };

  const initials = currentTeacher?.name
    ? currentTeacher.name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase()
    : 'GV';

  const bankFilled = bankForm.bankName && bankForm.accountNumber && bankForm.accountName;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-200">
          {initials}
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            Hồ sơ cá nhân
          </h2>
          <p className="text-xs text-gray-400">Quản lý thông tin cá nhân và tài khoản ngân hàng</p>
        </div>
      </div>

      {/* Save message toast */}
      {saveMsg && (
        <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl animate-in fade-in slide-in-from-right duration-300 ${
          saveMsg.startsWith('✅') ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {saveMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── CARD 1: Thông tin cá nhân ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <User size={18} className="text-blue-600" /> Thông tin cá nhân
            </h3>
            <button
              onClick={() => setEditingProfile(!editingProfile)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                editingProfile
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              <Edit3 size={12} /> {editingProfile ? 'Huỷ' : 'Chỉnh sửa'}
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Name - Read only */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Họ và tên</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <User size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">{currentTeacher?.name || '—'}</span>
                <Shield size={12} className="text-blue-400 ml-auto flex-shrink-0" title="Chỉ Admin có thể thay đổi" />
              </div>
            </div>

            {/* Phone - Read only */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Số điện thoại / Zalo</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <Phone size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">{currentTeacher?.phone || '—'}</span>
                <Shield size={12} className="text-blue-400 ml-auto flex-shrink-0" title="Chỉ Admin có thể thay đổi" />
              </div>
            </div>

            {/* Start Date - Read only */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Ngày vào làm</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <Calendar size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">
                  {currentTeacher?.startDate ? new Date(currentTeacher.startDate).toLocaleDateString('vi-VN') : '—'}
                </span>
                <Shield size={12} className="text-blue-400 ml-auto flex-shrink-0" title="Chỉ Admin có thể thay đổi" />
              </div>
            </div>

            {/* Branch - Read only */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Chi nhánh làm việc</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">
                  {currentTeacher?.branchCode ? `Cơ sở ${currentTeacher.branchCode}` : 'Chưa phân chi nhánh'}
                </span>
                <Shield size={12} className="text-blue-400 ml-auto flex-shrink-0" title="Chỉ Admin có thể thay đổi" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Email</label>
              {editingProfile ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-blue-200 focus-within:border-blue-400 transition">
                  <Mail size={16} className="text-blue-400 flex-shrink-0" />
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                    placeholder="email@example.com"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <Mail size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{profileForm.email || '—'}</span>
                </div>
              )}
            </div>


            {/* Address */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Địa chỉ (Thường trú/Tạm trú)</label>
              {editingProfile ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-blue-200 focus-within:border-blue-400 transition">
                  <MapPin size={16} className="text-blue-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={profileForm.address || ''}
                    onChange={e => setProfileForm({...profileForm, address: e.target.value})}
                    placeholder="Nhập địa chỉ của bạn..."
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <MapPin size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{profileForm.address || '—'}</span>
                </div>
              )}
            </div>

            {/* Specialty */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Chuyên môn</label>
              {editingProfile ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-blue-200 focus-within:border-blue-400 transition">
                  <Award size={16} className="text-blue-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={profileForm.specialty}
                    onChange={e => setProfileForm({...profileForm, specialty: e.target.value})}
                    placeholder="VD: THVP, Excel nâng cao, ..."
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <Award size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{profileForm.specialty || '—'}</span>
                </div>
              )}
            </div>

            {/* Bio */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Giới thiệu bản thân</label>
              {editingProfile ? (
                <textarea
                  value={profileForm.bio}
                  onChange={e => setProfileForm({...profileForm, bio: e.target.value})}
                  placeholder="Chia sẻ đôi dòng về bản thân..."
                  rows={3}
                  className="w-full text-sm bg-white rounded-xl px-4 py-3 border-2 border-blue-200 focus:border-blue-400 outline-none resize-none transition"
                />
              ) : (
                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 text-sm text-gray-700 min-h-[60px]">
                  {profileForm.bio || <span className="text-gray-400 italic">Chưa có thông tin</span>}
                </div>
              )}
            </div>

            {editingProfile && (
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Clock size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Đang lưu...' : 'Lưu thông tin cá nhân'}
              </button>
            )}
          </div>
        </div>

        {/* ── CARD 2: Thông tin thanh toán ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <CreditCard size={18} className="text-emerald-600" /> Thông tin thanh toán
            </h3>
            <button
              onClick={() => setEditingBank(!editingBank)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                editingBank
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
              }`}
            >
              <Edit3 size={12} /> {editingBank ? 'Huỷ' : 'Chỉnh sửa'}
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Status indicator */}
            {!bankFilled && !editingBank && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Chưa có thông tin thanh toán</p>
                  <p className="text-xs text-amber-600 mt-1">Vui lòng cập nhật tài khoản ngân hàng để Admin có thể chuyển lương cho bạn.</p>
                </div>
              </div>
            )}

            {bankFilled && !editingBank && (
              <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-gray-900 rounded-2xl p-5 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Landmark size={16} className="text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{bankForm.bankName}</span>
                  </div>
                  <p className="text-xl font-mono font-bold tracking-[0.15em] mb-1">{bankForm.accountNumber.replace(/(.{4})/g, '$1  ').trim()}</p>
                  <p className="text-sm font-bold text-white/80 uppercase">{bankForm.accountName}</p>
                  {bankForm.bankBranch && (
                    <p className="text-[10px] text-white/40 mt-2">Chi nhánh: {bankForm.bankBranch}</p>
                  )}
                  {/* Copy buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => copyToClipboard(bankForm.accountNumber, 'number')}
                      className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                      <Copy size={10} /> {copiedField === 'number' ? 'Đã copy!' : 'Copy STK'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(bankForm.accountName, 'name')}
                      className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                      <Copy size={10} /> {copiedField === 'name' ? 'Đã copy!' : 'Copy tên'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bank Name - Dropdown from VietQR API */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Ngân hàng</label>
              {editingBank ? (
                <BankSelect
                  value={bankForm.bankCode}
                  onChange={bank => setBankForm(prev => ({
                    ...prev,
                    bankCode: bank.bin,        // lưu BIN cho VietQR URL
                    bankName: bank.shortName,  // lưu tên hiển thị
                  }))}
                />
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <Landmark size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{bankForm.bankName || <span className="text-gray-400 italic">Chưa chọn</span>}</span>
                </div>
              )}
            </div>

            {/* Account Number */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Số tài khoản</label>
              {editingBank ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-emerald-200 focus-within:border-emerald-400 transition">
                  <CreditCard size={16} className="text-emerald-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={bankForm.accountNumber}
                    onChange={e => setBankForm({...bankForm, accountNumber: e.target.value.replace(/\D/g, '')})}
                    placeholder="Nhập số tài khoản"
                    className="flex-1 text-sm outline-none bg-transparent font-mono tracking-wider"
                    maxLength={20}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <CreditCard size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 font-mono tracking-wider">{bankForm.accountNumber || '—'}</span>
                </div>
              )}
            </div>

            {/* Account Name */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tên chủ tài khoản</label>
              {editingBank ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-emerald-200 focus-within:border-emerald-400 transition">
                  <User size={16} className="text-emerald-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={bankForm.accountName}
                    onChange={e => setBankForm({...bankForm, accountName: e.target.value.toUpperCase()})}
                    placeholder="VD: NGUYEN VAN A"
                    className="flex-1 text-sm outline-none bg-transparent uppercase font-bold"
                  />
                </div>
                ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <User size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 font-bold uppercase">{bankForm.accountName || '—'}</span>
                </div>
              )}
            </div>

            {/* Bank Branch */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Chi nhánh <span className="text-gray-300">(Tùy chọn)</span></label>
              {editingBank ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-emerald-200 focus-within:border-emerald-400 transition">
                  <Building2 size={16} className="text-emerald-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={bankForm.bankBranch}
                    onChange={e => setBankForm({...bankForm, bankBranch: e.target.value})}
                    placeholder="VD: Chi nhánh Hồ Chí Minh"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <Building2 size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{bankForm.bankBranch || <span className="text-gray-400 italic">Không bắt buộc</span>}</span>
                </div>
              )}
            </div>

            {editingBank && (
              <button
                onClick={handleSaveBank}
                disabled={saving || !bankForm.bankName || !bankForm.accountNumber || !bankForm.accountName}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Clock size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Đang lưu...' : 'Lưu thông tin thanh toán'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-violet-50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Shield size={18} className="text-purple-600" /> Trạng thái tài khoản
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Trạng thái',
                value: String(currentTeacher?.status).toLowerCase() === 'active' ? 'Đang hoạt động' : String(currentTeacher?.status).toLowerCase() === 'pending' ? 'Cấp quyền thi' : String(currentTeacher?.status).toLowerCase() === 'inactive' ? 'Chưa cấp quyền' : String(currentTeacher?.status).toLowerCase() === 'locked' ? 'Đã khóa' : currentTeacher?.status || 'N/A',
                color: String(currentTeacher?.status).toLowerCase() === 'active' ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50',
                icon: Shield,
              },
              {
                label: 'Điểm test',
                value: currentTeacher?.testScore != null ? `${currentTeacher.testScore}/100` : 'Chưa thi',
                color: (currentTeacher?.testScore || 0) >= 80 ? 'text-green-600 bg-green-50' : 'text-gray-600 bg-gray-50',
                icon: Award,
              },
              {
                label: 'Lương/buổi',
                value: currentTeacher?.baseSalaryPerSession ? `${Number(currentTeacher.baseSalaryPerSession).toLocaleString('vi-VN')}đ` : 'Chưa cấu hình',
                color: 'text-blue-600 bg-blue-50',
                icon: DollarSign,
              },
              {
                label: 'Ngày tham gia',
                value: currentTeacher?.createdAt ? new Date(currentTeacher.createdAt).toLocaleDateString('vi-VN') : '—',
                color: 'text-purple-600 bg-purple-50',
                icon: Calendar,
              },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="text-center">
                <div className={`w-12 h-12 rounded-2xl mx-auto mb-2 flex items-center justify-center ${color}`}>
                  <Icon size={20} />
                </div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{label}</p>
                <p className={`text-sm font-black mt-1 ${color.split(' ')[0]}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const TeacherDashboard = ({ onNavigate }) => {
  const { showModal } = useModal();
  const session = JSON.parse(localStorage.getItem('teacher_user') || '{}');
  const TEACHER_ID = session.id || session._id || 1;
  const {
    students: allStudents, teachers,
    getStudentsByTeacher, getTeacherStats,
    markAttendance: ctxMarkAttendance,
    updateStudentLink,
    notifications, getNotifications,
    getSchedulesByTeacher, getTeacherRating, RATING_CRITERIA, getTransactionsByTeacher,
    addSchedule, updateSchedule, cancelSchedule,
    revokeStudentExam, updateStudent, updateTeacher
  } = useData();

  const { socket, onlineUsers, lastSeenUsers } = useSocket();

  // Helper: tính "X phút trước" từ ISO string
  const timeAgo = (isoStr) => {
    if (!isoStr) return 'Chưa có dữ liệu';
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60)       return `${diff}s trước`;
    if (diff < 3600)     return `${Math.floor(diff / 60)}p trước`;
    if (diff < 86400)    return `${Math.floor(diff / 3600)}h trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  };

  // Khoá bài thi sinh viên qua socket
  const lockStudentExam = (student) => {
    const reason = `Giảng viên đã khoá bài thi của bạn. Lý do: Vi phạm quy chế giám sát.`;
    revokeStudentExam(student.id);
    if (socket) {
      socket.emit('exam:locked', {
        studentId: student.id,
        studentName: student.name,
        reason,
      });
    }
    showModal({ 
        title: 'Đã thực thi', 
        content: `Hệ thống đã khoá bài thi của ${student.name} và gửi thông báo trực tiếp qua socket. Học viên không thể tiếp tục làm bài.`, 
        type: 'success' 
    });
  };

  // Trạng thái hiện tại của GV
  const currentTeacher = teachers.find(t => String(t.id) === String(TEACHER_ID) || String(t._id) === String(TEACHER_ID));
  // Vấn đề: `teachers` ở frontend đôi lúc không chứa giáo viên hiện tại do phân quyền gọi getAll.
  // Giải pháp: Sử dụng thêm session.status để kiểm tra fallback chuẩn xác nhất.
  const currentStatus = String(currentTeacher?.status || session.status || '').toLowerCase();
  const isApproved = currentStatus === 'active';

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Active Attendance Modal State
  const [pendingAttendanceSchedule, setPendingAttendanceSchedule] = useState(null);
  const [noShowReason, setNoShowReason] = useState('');

  // Active Attendance Checker
  useEffect(() => {
    const interval = setInterval(() => {
      // Don't override if already handling one
      if (pendingAttendanceSchedule) return;

      const now = new Date();
      const mySchedulesList = getSchedulesByTeacher(TEACHER_ID);

      const pending = mySchedulesList.find(s => {
        if (s.status !== 'scheduled') return false;
        
        // Ensure the date is today
        const sd = new Date(s.date);
        if (
          sd.getFullYear() !== now.getFullYear() ||
          sd.getMonth() !== now.getMonth() ||
          sd.getDate() !== now.getDate()
        ) return false;

        // Check time
        if (!s.endTime) return false;
        const [eh, em] = s.endTime.split(':');
        // Subtract 0 so it's a number
        const endObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(eh, 10), parseInt(em, 10), 0);
        
        return now >= endObj;
      });

      if (pending) {
        setPendingAttendanceSchedule(pending);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [pendingAttendanceSchedule, getSchedulesByTeacher, TEACHER_ID]);

  const handleActiveAttend = async () => {
    if (!pendingAttendanceSchedule) return;
    try {
      const s = pendingAttendanceSchedule;
      // Mark local students attendance + minus lesson
      await markAttendance(s.studentId, 'Hệ thống: Điểm danh tự động', 0);
      // Update schedule to completed
      updateSchedule(s.id || s._id, { status: 'completed' });
    } catch (e) {
      toast.error('Lỗi điểm danh!');
    }
    setPendingAttendanceSchedule(null);
  };

  const handleActiveNoShow = async () => {
    if (!pendingAttendanceSchedule || !noShowReason.trim()) return;
    try {
      const s = pendingAttendanceSchedule;
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const token = localStorage.getItem('teacher_access_token') || localStorage.getItem('admin_access_token');
      await fetch(`${API}/api/schedules/${s._id || s.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: noShowReason }),
      });
      cancelSchedule(s._id || s.id, noShowReason);
    } catch (e) {
    }
    setPendingAttendanceSchedule(null);
    setNoShowReason('');
  };

  const handleScheduleSubmit = (form) => {
    // Nếu có ID hợp lệ thì mới là Update, ngược lại (chỉ có date prefill) là Create Mới
    if (editingSchedule && (editingSchedule.id || editingSchedule._id)) {
      updateSchedule(editingSchedule.id || editingSchedule._id, form);
    } else {
      addSchedule({ ...form, teacherId: TEACHER_ID });
    }
    setShowScheduleModal(false);
    setEditingSchedule(null);
  };

  const startEditSchedule = (sch) => {
    setEditingSchedule(sch);
    setShowScheduleModal(true);
  };

  const students = getStudentsByTeacher(TEACHER_ID).map(s => {
    const studentId = s._id || s.id;
    return {
      ...s,
      displayName: getDisplayName(s),
      avatar: getDisplayName(s).substring(0, 2).toUpperCase(),
      color: (typeof studentId === 'number' ? studentId : (String(studentId).charCodeAt(0) || 0)) % 2 === 1 ? 'bg-purple-500' : 'bg-blue-500',
    };
  });
  const teacherName = (currentTeacher?.name && !/^\d+$/.test(currentTeacher.name)) 
    ? currentTeacher.name 
    : currentTeacher?.email || currentTeacher?.phone || session.name || 'Giảng viên';

  const [gradeInputs, setGradeInputs] = useState({});
  const [noteInputs, setNoteInputs] = useState({});
  const [studentSearch, setStudentSearch] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const currentHash = location.hash?.replace('#', '') || '';
  const toast = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Auto-select first student if none selected
  useEffect(() => {
    if (!selectedStudentId && students.length > 0) {
      setSelectedStudentId(students[0]._id || students[0].id);
    }
  }, [students, selectedStudentId]);

  const markAttendance = async (id, noteParam, gradeParam) => {
    const note = noteParam || noteInputs[id] || 'Đã điểm danh';
    const grade = gradeParam !== undefined ? gradeParam : (gradeInputs[id] || 0);
    try {
      await ctxMarkAttendance(id, note, Number(grade));
      toast.success('Đã điểm danh thành công!');
    } catch (err) {
      if (err.cooldown) {
        toast.error(err.message || 'Học viên này đã được điểm danh. Vui lòng thử lại sau 12 tiếng.');
      } else {
        toast.error('Lỗi khi điểm danh. Vui lòng thử lại.');
      }
    }
  };

  const updateLink = (id, newLink) => updateStudentLink(id, newLink);
  const saveGrade = (id, grade) => {
    setGradeInputs(prev => ({ ...prev, [id]: grade }));
    updateStudent(id, { lastGrade: grade });
  };
  const updateNotes = (id, notes) => {
    setNoteInputs(prev => ({ ...prev, [id]: notes }));
    updateStudent(id, { notes });
  };

  const stats = getTeacherStats(TEACHER_ID);
  const totalDone = stats.totalSessions;
  const totalSess = students.reduce((sum, s) => sum + s.totalSessions, 0);
  const avgGrade = stats.avgGrade;
  const completed = stats.completed;

  const mySchedules = useMemo(() => getSchedulesByTeacher(TEACHER_ID), [getSchedulesByTeacher, TEACHER_ID]);
  const [teacherRating, setTeacherRating] = useState({ avg: 0, count: 0, ratings: [] });
  useEffect(() => {
    api.evaluations.getByTeacher(TEACHER_ID).then(res => {
      if (res.success && res.data) {
        const validRatings = res.data.filter(r => r.criteria && r.criteria.stars);
        const count = validRatings.length;
        const avg = count > 0 ? (Math.round((validRatings.reduce((s, r) => s + r.criteria.stars, 0) / count) * 10) / 10) : 0;
        setTeacherRating({ avg, count, ratings: res.data });
      }
    }).catch(err => void 0);
  }, [TEACHER_ID]);
  const myTransactions = useMemo(() => getTransactionsByTeacher(TEACHER_ID), [getTransactionsByTeacher, TEACHER_ID]);

  const monthlyTransactions = useMemo(() => {
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();
    return myTransactions.filter(t => {
      // Parse flexible date formats (ISO or local dd/mm/yyyy)
      let d;
      if (typeof t.date === 'string' && t.date.includes('/')) {
        const [day, month, year] = t.date.split('/');
        d = new Date(year, month - 1, day);
      } else {
        d = new Date(t.createdAt || t.date);
      }
      return d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
  }, [myTransactions]);

  const totalMonthlyIncome = monthlyTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const myNotifs = getNotifications(TEACHER_ID, 'teacher').filter(n => !n.read).length;

  // ── MÀN HÌNH CHỜ DUYỆT ── chỉ hiện nút Bài Test
  // ⭐ Fix: Chuyển sang logic "Pessimistic" (Coi là pending nếu KHÔNG PHẢI là active)
  const isPending = String(session?.status || '').toLowerCase() !== 'active' && 
                    String(currentTeacher?.status || '').toLowerCase() !== 'active';
  
  if (session.role === 'teacher' && isPending) {
    return (
      <div className="bg-transparent flex items-center justify-center p-6 h-full">
        <div className="max-w-lg w-full">
          {/* Card trung tâm */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-800 to-blue-950 px-8 py-8 text-white text-center">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock size={32} className="text-yellow-300" />
              </div>
              <h2 className="text-xl font-black mb-1">Tài khoản đang chờ duyệt</h2>
              <p className="text-blue-200 text-sm">Xin chào, <strong>{teacherName}</strong>!</p>
            </div>

            {/* Body */}
            <div className="p-8 space-y-5">
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
                <p className="font-bold mb-1">⏳ Trạng thái: Chờ Admin duyệt</p>
                <p className="text-yellow-700 leading-relaxed">
                  Tài khoản của bạn chưa được cấp quyền giảng dạy chính thức. Vui lòng hoàn thành <strong>bài thi đánh giá</strong> để Admin xét duyệt.
                </p>
              </div>

              {/* Quy trình */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">QUY TRÌNH CẤP QUYỀN</p>
                {(() => {
                  const step1Done = currentTeacher?.testScore != null;
                  const step2Done = !!currentTeacher?.practicalFile;
                  const step3Active = step1Done && step2Done;

                  const steps = [
                    {
                      step: '1',
                      label: 'Hoàn thành bài thi',
                      done: step1Done,
                      sub: step1Done ? `Điểm: ${currentTeacher.testScore}/100` : 'Chưa thi',
                      color: 'bg-green-500',
                      text: 'text-green-700'
                    },
                    {
                      step: '2',
                      label: 'Nộp bài thực hành',
                      done: step2Done,
                      sub: step2Done ? (currentTeacher.practicalStatus === 'reviewed' ? 'Đã duyệt' : 'Đã nộp bài') : 'Chưa nộp',
                      color: 'bg-blue-500',
                      text: 'text-blue-700'
                    },
                    {
                      step: '3',
                      label: 'Admin xét duyệt',
                      done: false,
                      active: step3Active,
                      sub: step3Active ? 'Đang chờ Admin chấm điểm...' : 'Đang chờ...',
                      color: 'bg-red-500',
                      text: 'text-red-700'
                    },
                  ];

                  return steps.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-4 p-4 rounded-2xl transition-all border-2 ${
                        s.done ? 'bg-green-50 border-green-100' :
                        s.active ? 'bg-red-50 border-red-200 animate-pulse' :
                        'bg-gray-50 border-transparent'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 shadow-sm ${
                        s.done ? 'bg-green-500 text-white' :
                        s.active ? 'bg-red-500 text-white' :
                        'bg-gray-200 text-gray-400'
                      }`}>
                        {s.done ? '✓' : s.step}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${
                          s.done ? 'text-green-800' :
                          s.active ? 'text-red-800' :
                          'text-gray-600'
                        }`}>{s.label}</p>
                        <p className={`text-[11px] ${
                          s.done ? 'text-green-600/70' :
                          s.active ? 'text-red-500 font-medium' :
                          'text-gray-400'
                        }`}>{s.sub}</p>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Nút tác vụ */}
              <button
                onClick={() => navigate('/teacher/test')}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-lg ${
                  (currentTeacher?.testScore != null && !!currentTeacher?.practicalFile)
                  ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-black'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 shadow-blue-500/30'
                }`}
              >
                <BookOpen size={20} />
                {currentTeacher?.testScore == null ? 'Làm bài thi ngay' :
                 !currentTeacher?.practicalFile ? 'Tiếp tục nộp bài thực hành' :
                 'Xem lại bài thi'}
                <ChevronRight size={20} />
              </button>
              <p className="text-xs text-center text-gray-400">Liên hệ Admin: <strong className="text-gray-600">093-5758-462</strong> nếu cần hỗ trợ</p>

            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent h-full">
      {/* Popup thông báo — hiện 1 lần/ngày */}
      <PopupBanner role="teacher" />

      <div className="min-w-0 pt-4">
        {/* Topbar removed - using DashboardLayout header */}


        {/* ═══ CONTENT ═══ */}
        {currentHash === 'training' ? (
           <TeacherTrainingLMS onBack={() => window.location.hash = ''} />
        ) : currentHash === 'students' ? (
          /* ═══ QUẢN LÝ HỌC VIÊN 2 CỘT ═══ */
          <div className="px-4 md:px-8 py-6 h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-6 overflow-hidden">
            
            {/* CỘT 1: DANH SÁCH HỌC VIÊN (Sidebar) */}
            <div className="w-full lg:w-80 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
               <div className="p-4 border-b border-gray-50 bg-gray-50/30">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Tìm học viên..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 transition-all"
                    />
                  </div>
               </div>
               
               <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {students
                    .filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.course?.toLowerCase().includes(studentSearch.toLowerCase()))
                    .map(s => {
                      const sId = s._id || s.id;
                      const isOnline = onlineUsers.some(u => String(u.userId) === String(sId));
                      const isSelected = String(selectedStudentId) === String(sId);
                      return (
                        <div
                          key={sId}
                          onClick={() => setSelectedStudentId(sId)}
                          role="button"
                          tabIndex={0}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group cursor-pointer ${
                            isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedStudentId(sId); } }}
                        >
                          <div className="relative">
                            <div className={`w-10 h-10 ${isSelected ? 'bg-white/20' : s.color} rounded-xl flex items-center justify-center font-bold text-sm shadow-sm`}>
                              {s.avatar}
                            </div>
                            {isOnline && (
                              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" title="Đang hoạt động" />
                            )}
                          </div>
                          
                          <div className="flex-1 text-left min-w-0">
                            <p className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>{s.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isOnline ? (
                                <span className={`text-[10px] font-bold uppercase tracking-tighter ${isSelected ? 'text-blue-200' : 'text-green-500'}`}>Đang online</span>
                              ) : (
                                <span className={`text-[10px] font-medium ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                                  {lastSeenUsers[String(sId)]
                                    ? `${timeAgo(lastSeenUsers[String(sId)])}`
                                    : 'Chưa online'}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {!isSelected && (
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                navigate('/teacher/inbox'); 
                              }} 
                              className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-600 transition-all border-none outline-none"
                            >
                              <MessageSquare size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  }
                  {students.length === 0 && (
                     <div className="text-center py-10 opacity-30">
                        <Users size={40} className="mx-auto mb-2" />
                        <p className="text-sm font-bold">Chưa có học viên</p>
                     </div>
                  )}
               </div>
            </div>

            {/* CỘT 2: CHI TIẾT HỌC VIÊN (Main Content) */}
            <div className="flex-1 overflow-y-auto pr-1">
              {selectedStudentId ? (
                (() => {
                  const student = students.find(s => String(s.id) === String(selectedStudentId) || String(s._id) === String(selectedStudentId));
                  if (!student) return <div className="p-20 text-center text-gray-400">Không tìm thấy thông tin</div>;
                  return (
                    <StudentCard 
                      key={student._id || student.id} student={student}
                      onAttendance={markAttendance} onUpdateLink={updateLink}
                      onSaveGrade={saveGrade} onUpdateNotes={updateNotes}
                      onLockExam={lockStudentExam} 
                      isDetailed={true}
                    />
                  );
                })()
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white rounded-[40px] border-2 border-dashed border-gray-100 text-gray-300">
                   <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <GraduationCap size={40} />
                   </div>
                   <p className="font-bold">Vui lòng chọn học viên ở danh sách bên trái</p>
                </div>
              )}
            </div>
          </div>

        ) : currentHash === 'schedule' ? (
          /* ═══ LỊCH DẠY ═══ */
          <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Calendar size={20} className="text-blue-600" /> Lịch dạy
              </h2>
              <button onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2">
                <Plus size={14} /> Xếp lịch mới
              </button>
            </div>
            <MonthlyCalendar
              schedules={mySchedules}
              onEditSchedule={startEditSchedule}
              onAddSchedule={(date) => {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                setEditingSchedule({ date: `${yyyy}-${mm}-${dd}` }); // pre-fill correctly localized
                setShowScheduleModal(true);
              }}
              onCancelSchedule={(scheduleId, reason) => {
                cancelSchedule(scheduleId, reason);
              }}
            />
          </div>

        ) : currentHash === 'assignments' ? (
          /* ═══ BÀI TẬP / THỰC HÀNH ═══ */
          <div className="px-4 md:px-8 py-6 md:py-8">
            <TeacherAssignmentsView teacherId={TEACHER_ID} myStudents={students} />
          </div>

        ) : currentHash === 'profile' ? (
          /* ═══ HỒ SƠ CÁ NHÂN ═══ */
          <TeacherProfileSection teacherId={TEACHER_ID} currentTeacher={currentTeacher} />

        ) : (
          /* ═══ TỔNG QUAN CHUYÊN NGHIỆP ═══ */
          <div className="px-4 md:px-8 py-6 md:py-8 space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            
            {/* ── HIGHLIGHT HERO SECTION ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Income & Performance Card */}
               <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 h-full">
                     <div className="space-y-4">
                        <div>
                           <p className="text-blue-300 text-xs font-black uppercase tracking-widest mb-1">Thu nhập tháng {new Date().getMonth()+1}</p>
                           <h3 className="text-4xl font-black">{totalMonthlyIncome.toLocaleString('vi-VN')} <span className="text-xl">đ</span></h3>
                        </div>
                        <div className="flex items-center gap-6">
                           <div className="flex flex-col">
                              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Học viên hoàn thành</span>
                              <span className="text-2xl font-black text-emerald-400">{completed} <span className="text-xs text-slate-400">người</span></span>
                           </div>
                           <div className="w-[1px] h-10 bg-white/10" />
                           <div className="flex flex-col">
                              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Buổi dạy đã xong</span>
                              <span className="text-2xl font-black text-blue-400">{totalDone} <span className="text-xs text-slate-400">buổi</span></span>
                           </div>
                        </div>
                     </div>
                     <button onClick={() => navigate('/teacher/finance')} 
                        className="bg-white/10 hover:bg-white/20 border border-white/10 px-8 py-4 rounded-3xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 group">
                        Chi tiết thu nhập <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                     </button>
                  </div>
               </div>

               {/* Rating & Identity Card */}
               <div className="bg-white rounded-[40px] p-8 border border-gray-100 shadow-xl shadow-gray-200/50 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-amber-300" />
                  <div className={`w-20 h-20 ${(currentTeacher?.color || 'bg-blue-600')} rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg mb-4`}>
                    {teacherName.substring(0, 2).toUpperCase()}
                  </div>
                  <h4 className="text-lg font-black text-gray-800 mb-1">{teacherName}</h4>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Giảng viên Chuyên môn</p>
                  
                  {/* STAR RATING DISPLAY */}
                  <div className="bg-orange-50 px-6 py-4 rounded-[32px] border border-orange-100 w-full">
                     <div className="flex items-center justify-center gap-1 mb-1">
                        {[1, 2, 3, 4, 5].map(star => (
                           <Star key={star} size={20} className={star <= Math.round(teacherRating.avg) ? "text-orange-500 fill-orange-500" : "text-gray-200"} />
                        ))}
                     </div>
                     <p className="text-2xl font-black text-orange-600 leading-none">{teacherRating.avg || '—'}</p>
                     <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mt-1">{teacherRating.count} lượt đánh giá từ học viên</p>
                  </div>
               </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: 'Đang dạy', value: students.length, sub: 'học viên', color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
                { icon: BookOpen, label: 'Lộ trình', value: `${totalDone}/${totalSess}`, sub: 'tổng số buổi', color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50' },
                { icon: Award, label: 'Điểm TB', value: avgGrade, sub: '/ 10 điểm', color: 'from-amber-500 to-orange-500', bg: 'bg-orange-50' },
                { icon: Star, label: 'Uy tín', value: teacherRating.avg, sub: `${teacherRating.count} đánh giá`, color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50' },
              ].map(({ icon: Icon, label, value, sub, color, bg }) => (
                <div key={label} className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:scale-[1.02] transition-all group overflow-hidden relative">
                  <div className={`absolute -right-4 -bottom-4 w-20 h-20 ${bg} rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700`} />
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg group-hover:rotate-12 transition-transform`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1 relative z-10">{label}</p>
                  <p className="text-3xl font-black text-gray-800 relative z-10">{value}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 relative z-10">{sub}</p>
                </div>
              ))}
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 rounded-3xl p-6 text-white shadow-xl shadow-blue-900/20">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-yellow-300" />
                <h3 className="font-black text-base">Công việc cần xử lý ngay</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    icon: UserCheck,
                    label: 'Điểm danh',
                    sub: `${mySchedules.filter(s => s.status === 'scheduled' && new Date(s.date).toDateString() === new Date().toDateString()).length} buổi hôm nay`,
                    color: 'bg-green-500/20 hover:bg-green-500/30 border-green-400/30',
                    action: () => navigate('/teacher#students'),
                  },
                  {
                    icon: Clipboard,
                    label: 'Chấm điểm',
                    sub: `${students.filter(s => !s.lastGrade || s.lastGrade === 0).length} HV chưa có điểm`,
                    color: 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-400/30',
                    action: () => navigate('/teacher#students'),
                  },
                  {
                    icon: MessageSquare,
                    label: 'Tin nhắn',
                    sub: `${myNotifs} chưa đọc`,
                    color: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-400/30',
                    action: () => navigate('/teacher/inbox'),
                  },
                  {
                    icon: Calendar,
                    label: 'Xếp lịch',
                    sub: 'Thêm buổi dạy mới',
                    color: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400/30',
                    action: () => { navigate('/teacher#schedule'); },
                  },
                ].map(({ icon: Icon, label, sub, color, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className={`${color} border rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <Icon size={22} className="text-white mb-2" />
                    <p className="font-bold text-sm text-white">{label}</p>
                    <p className="text-[11px] text-white/60 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Student cards (compact) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <GraduationCap size={18} className="text-blue-600" /> Học viên được phân công
                  </h3>
                </div>
                {students.map(s => {
                  const done = s.totalSessions - s.remainingSessions;
                  const pct = Math.round((done / s.totalSessions) * 100);
                  return (
                    <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition group">
                      <div className={`w-12 h-12 ${s.color} rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                        {s.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.course}</p>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-blue-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-black text-gray-800">{pct}%</p>
                        <p className="text-[10px] text-gray-400">{done}/{s.totalSessions}</p>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => navigate('/teacher#students')}
                  className="w-full text-sm font-bold text-blue-600 bg-blue-50 py-3 rounded-xl hover:bg-blue-100 transition flex items-center justify-center gap-1">
                  Quản lý chi tiết <ChevronRight size={14} />
                </button>
              </div>

              {/* Right sidebar */}
              <div className="lg:col-span-5 space-y-6">
                {/* Rating summary */}
                <TeacherRatingDisplay rating={teacherRating} RATING_CRITERIA={RATING_CRITERIA} />

                {/* Upcoming schedule */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                      <Calendar size={14} className="text-blue-500" /> Lịch dạy sắp tới
                    </h4>
                    <button onClick={() => navigate('/teacher#schedule')} className="text-[10px] text-blue-600 font-bold hover:underline">
                      Xem tất cả →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {mySchedules.filter(s => s.status === 'scheduled').slice(0, 3).length === 0 && (
                      <p className="px-5 py-4 text-xs text-gray-400 text-center">Chưa có lịch dạy.</p>
                    )}
                    {mySchedules.filter(s => s.status === 'scheduled').slice(0, 3).map(s => (
                      <div key={s.id} className="px-5 py-3 flex items-center gap-3 hover:bg-blue-50/30 transition group">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex flex-col items-center justify-center text-blue-600 flex-shrink-0">
                          <span className="text-sm font-black">{new Date(s.date).getDate()}</span>
                          <span className="text-[8px] font-bold opacity-60">T{new Date(s.date).getMonth()+1}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{s.topic}</p>
                          <p className="text-[10px] text-gray-400">{s.startTime} • {s.studentName}</p>
                        </div>
                        <span className="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded-lg flex-shrink-0">{s.startTime}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity summary */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={16} className="text-blue-400" />
                    <h4 className="font-bold text-sm">Tóm tắt hoạt động</h4>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Tổng buổi dạy đã hoàn thành', value: mySchedules.filter(s => s.status === 'completed').length, color: 'text-green-400' },
                      { label: 'Đánh giá trung bình', value: `${teacherRating?.avg || '—'} ⭐`, color: 'text-yellow-400' },
                      { label: 'HV đã hoàn thành KH', value: completed, color: 'text-blue-400' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">{item.label}</span>
                        <span className={`font-black ${item.color}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showScheduleModal && (
        <ScheduleModal
          students={students}
          schedule={editingSchedule}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={handleScheduleSubmit}
        />
      )}
      {/* ─ ACTIVE ATTENDANCE MODAL ─ */}
      {pendingAttendanceSchedule && (
        <div className="fixed inset-0 bg-slate-900/80 z-[999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-blue-500/20">
            <div className="bg-blue-600 p-6 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                <Clock size={24} className="animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-lg">Xác nhận hoàn thành buổi dạy</h3>
                <p className="text-blue-100 text-sm mt-1">Đã quá giờ kết thúc, vui lòng điểm danh.</p>
              </div>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="grid gap-2">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 text-sm font-semibold">Học viên</span>
                    <span className="font-bold text-slate-800 text-base">{pendingAttendanceSchedule.studentName}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 text-sm font-semibold">Môn học</span>
                    <span className="font-bold text-blue-700">{pendingAttendanceSchedule.course}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-500 text-sm font-semibold">Thời gian</span>
                    <span className="font-black text-slate-800 tracking-wide bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">
                      {pendingAttendanceSchedule.startTime} - {pendingAttendanceSchedule.endTime}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <button
                  onClick={handleActiveAttend}
                  className="w-full py-4 text-white font-black bg-blue-600 rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 text-lg hover:-translate-y-0.5"
                >
                  <CheckCircle size={22} /> Điểm danh ngay
                </button>
                
                <div className="border border-red-100 bg-red-50/50 rounded-2xl p-4">
                  <label className="text-xs font-black text-red-800 uppercase tracking-widest block mb-2">Học viên không học?</label>
                  <textarea
                    rows={2}
                    value={noShowReason}
                    onChange={e => setNoShowReason(e.target.value)}
                    placeholder="Bắt buộc nhập lý do (VD: HS xin nghỉ, GV bận đột xuất...)"
                    className="w-full border-2 border-red-200 focus:border-red-400 rounded-xl px-4 py-3 text-sm outline-none resize-none bg-white mb-3"
                  />
                  <button
                    onClick={handleActiveNoShow}
                    disabled={!noShowReason.trim()}
                    className="w-full py-3 text-red-600 font-bold bg-white border-2 border-red-200 rounded-xl hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Báo hủy buổi học
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TeacherDashboard;
