import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar, Video, CheckCircle, Save, MessageSquare, FileText,
  GraduationCap, TrendingUp, Clock, Star, Link2, Upload,
  Bell, LogOut, Plus, ChevronRight, BookOpen, Award, Zap,
  BarChart3, Users, ArrowLeft, ChevronLeft, Eye, X, XCircle,
  Search, Download, AlertCircle, Clipboard, Send, UserCheck,
  Activity, DollarSign, Filter, User, Phone, Mail, Building2,
  CreditCard, Landmark, Copy, Edit3, Shield
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useSocket } from '../context/SocketContext';
import api, { teachersAPI } from '../services/api';
import { useToast } from '../utils/toast';
import { BankSelect } from './BankSelect';
import PopupBanner from './PopupBanner';

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
    topic: schedule?.topic || '',
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
          <h3 className="font-bold flex items-center gap-2"><Calendar size={18}/> {schedule ? 'Cập nhật lịch học' : 'Xếp lịch học mới'}</h3>
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
            {schedule ? 'CẬP NHẬT LỊCH' : 'XẾP LỊCH NGAY'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── STUDENT CARD ─────────────────────────────────────────────────────────
const StudentCard = ({ student, onAttendance, onUpdateLink, onSaveGrade, onUpdateNotes, onLockExam }) => {
  const [linkInput, setLinkInput] = useState(student.linkHoc);
  const [gradeInput, setGradeInput] = useState(student.lastGrade);
  const [notesInput, setNotesInput] = useState(student.notes || '');
  const [activePanel, setActivePanel] = useState('progress');
  const [linkSaved, setLinkSaved] = useState(false);
  const [gradeSaved, setGradeSaved] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attForm, setAttForm] = useState({ note: 'Đã điểm danh hoàn thành buổi học', grade: student.lastGrade || 0 });

  const done = student.totalSessions - student.remainingSessions;
  const progressPct = Math.round((done / student.totalSessions) * 100);
  const isCompleted = student.remainingSessions === 0;

  const handleLinkSave = () => {
    onUpdateLink(student.id, linkInput);
    setLinkSaved(true); setTimeout(() => setLinkSaved(false), 2000);
  };

  const handleGradeSave = () => {
    onSaveGrade(student.id, Number(gradeInput));
    setGradeSaved(true); setTimeout(() => setGradeSaved(false), 2000);
  };

  const panels = [
    { key: 'progress', icon: CheckCircle, label: 'Tiến độ' },
    { key: 'link',     icon: Video,       label: 'Link học' },
    { key: 'grade',    icon: FileText,    label: 'Đánh giá' },
  ];

  return (
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
            {/* Nút Đánh trượt bài thi */}
            {onLockExam && (
              <button
                onClick={() => {
                    if (window.confirm(`Xác nhận đánh trượt bài thi của ${getDisplayName(student)}?`)) onLockExam(student);
                }}
                title="Đánh trượt / Khoá bài thi ngay lập tức"
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

      {/* Panel Content */}
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
            <button onClick={() => setShowAttendanceModal(true)} disabled={isCompleted}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
                isCompleted ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:to-green-600 shadow-green-200'
              }`}>
              <CheckCircle size={20} /> {isCompleted ? 'ĐÃ HOÀN THÀNH KHÓA HỌC' : 'ĐIỂM DANH BUỔI HÔM NAY'}
            </button>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">📝 Ghi chú học viên</label>
              <textarea value={notesInput} onChange={e => setNotesInput(e.target.value)}
                onBlur={() => onUpdateNotes(student.id, notesInput)} rows={3}
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
                <h3 className="font-bold text-blue-800">Link học trực tuyến</h3>
              </div>
              <p className="text-xs text-blue-500 mb-4">Học viên sẽ thấy link này trên Dashboard. Cập nhật mỗi buổi học.</p>
              <a href={student.linkHoc} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 break-all">
                <Link2 size={14} /> {student.linkHoc}
              </a>
              <div className="flex gap-2">
                <input type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                  className="flex-1 border-2 border-blue-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                  placeholder="https://meet.google.com/..." />
                <button onClick={handleLinkSave}
                  className={`px-5 py-3 rounded-xl font-bold text-sm transition-all ${linkSaved ? 'bg-green-500 text-white' : 'bg-slate-800 text-white hover:bg-black'}`}>
                  {linkSaved ? '✓ Đã lưu' : 'Cập nhật'}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-3">Link gợi ý nhanh:</p>
              <div className="flex flex-wrap gap-2">
                {['Google Meet', 'Zoom', 'Microsoft Teams'].map(platform => (
                  <button key={platform} onClick={() => {
                    const urls = { 'Google Meet': 'https://meet.google.com/', 'Zoom': 'https://zoom.us/j/', 'Microsoft Teams': 'https://teams.microsoft.com/l/meetup-join/' };
                    setLinkInput(urls[platform]);
                  }} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors">
                    {platform}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePanel === 'grade' && (
          <div className="space-y-5">
            <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100">
              <div className="flex items-center gap-2 mb-4">
                <Star size={18} className="text-orange-500 fill-orange-500" />
                <h3 className="font-bold text-orange-800">Chấm điểm học viên</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-orange-600 font-semibold uppercase tracking-wide block mb-2">Điểm hiện tại (0-10)</label>
                  <input type="number" min="0" max="10" step="0.5" value={gradeInput}
                    onChange={e => setGradeInput(e.target.value)}
                    className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 text-2xl font-black text-orange-700 focus:border-orange-500 outline-none text-center" />
                </div>
                <div className="text-center">
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-lg ${
                    gradeInput >= 8.5 ? 'bg-gradient-to-br from-green-500 to-green-600'
                    : gradeInput >= 7 ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                    : gradeInput >= 5 ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                    : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}>{gradeInput >= 8.5 ? 'A' : gradeInput >= 7 ? 'B' : gradeInput >= 5 ? 'C' : 'D'}</div>
                  <p className="text-xs text-gray-400 mt-1">Xếp loại</p>
                </div>
              </div>
              <button onClick={handleGradeSave}
                className={`w-full mt-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  gradeSaved ? 'bg-green-500 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-200'
                }`}>
                <Save size={16} /> {gradeSaved ? '✓ Đã lưu điểm!' : 'LƯU ĐIỂM'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              {[
                { range: '8.5–10', label: 'Xuất sắc', color: 'bg-green-100 text-green-700', grade: 'A' },
                { range: '7–8.4', label: 'Khá', color: 'bg-blue-100 text-blue-700', grade: 'B' },
                { range: '5–6.9', label: 'Trung bình', color: 'bg-orange-100 text-orange-700', grade: 'C' },
                { range: '< 5', label: 'Yếu', color: 'bg-red-100 text-red-700', grade: 'D' },
              ].map(r => (
                <div key={r.grade} className={`${r.color} rounded-xl p-2`}>
                  <p className="font-black text-lg">{r.grade}</p>
                  <p className="font-semibold">{r.label}</p>
                  <p className="opacity-70">{r.range}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-green-600 p-5 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <CheckCircle size={20} /> Điểm danh & Chấm điểm
              </h3>
              <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-green-700 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <p className="text-sm font-bold text-green-800">Học viên: {student.name}</p>
                <p className="text-xs text-green-600">Tiến độ hiện tại: {done}/{student.totalSessions} buổi</p>
              </div>
              
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Điểm đánh giá buổi học (0-10)</label>
                <input 
                  type="number" min="0" max="10" step="0.5" 
                  value={attForm.grade}
                  onChange={(e) => setAttForm({ ...attForm, grade: e.target.value })}
                  className="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-3 text-lg font-black outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Ghi chú / Nhận xét nhanh</label>
                <textarea 
                  rows={3}
                  value={attForm.note}
                  onChange={(e) => setAttForm({ ...attForm, note: e.target.value })}
                  placeholder="VD: Học viên tiếp thu bài tốt..."
                  className="w-full border-2 border-gray-200 focus:border-green-500 rounded-xl px-4 py-3 text-sm outline-none resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setShowAttendanceModal(false)}
                className="flex-1 py-3 text-gray-500 font-bold bg-gray-50 rounded-xl hover:bg-gray-100"
              >
                Hủy
              </button>
              <button 
                onClick={() => {
                  onAttendance(student.id, attForm.note, Number(attForm.grade));
                  setShowAttendanceModal(false);
                }}
                className="flex-[2] py-3 text-white font-bold bg-green-600 rounded-xl shadow-lg shadow-green-200 hover:bg-green-700"
              >
                Xác nhận Điểm danh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MONTHLY CALENDAR ────────────────────────────────────────────────────────

const MonthlyCalendar = ({ schedules, onEditSchedule }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6',
    'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

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

  // Detail view for selected date
  const selectedSchedules = selectedDate ? (scheduleMap[selectedDate] || []) : [];

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Calendar Grid */}
      <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Month header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-700">Lịch theo tháng</h3>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronLeft size={18} className="text-gray-500" />
            </button>
            <span className="text-sm font-bold text-gray-700 min-w-[120px] text-center">
              {monthNames[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 text-center px-4 pt-3">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
            <div key={d} className={`text-[11px] font-bold py-2 ${i === 0 ? 'text-red-500' : 'text-gray-500'}`}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 px-4 pb-4 gap-1">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;
            const hasSchedule = scheduleMap[day]?.length > 0;
            const daySchedules = scheduleMap[day] || [];
            const hasCompleted = daySchedules.some(s => s.status === 'completed');
            const hasUpcoming = daySchedules.some(s => s.status === 'scheduled');
            const hasCancelled = daySchedules.some(s => s.status === 'cancelled');
            const isSelected = selectedDate === day;

            return (
              <button key={day} onClick={() => setSelectedDate(day === selectedDate ? null : day)}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold transition-all ${
                  isSelected ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300' :
                  isToday(day) ? 'bg-teal-50 text-teal-700 ring-2 ring-teal-400' :
                  hasSchedule ? 'bg-teal-50 text-teal-700 hover:bg-teal-100' : 'text-gray-700 hover:bg-gray-50'
                }`}>
                {day}
                {hasSchedule && (
                  <div className="flex gap-0.5 mt-0.5">
                    {hasCompleted && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {hasUpcoming && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    {hasCancelled && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-6 pb-4 flex gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Sắp tới</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> Hoàn thành</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> Đã hủy</span>
        </div>
      </div>

      {/* Side Detail */}
      <div className="lg:col-span-5 space-y-4">
        {/* Today's schedule */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
          <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mb-2">
            {selectedDate
              ? `Ngày ${selectedDate}/${month + 1}/${year}`
              : `Hôm nay — ${today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}`
            }
          </p>
          {selectedSchedules.length > 0 ? (
            <div className="space-y-3 mt-3">
              {selectedSchedules.map(s => (
                <div key={s.id} className="bg-white/10 rounded-xl p-3">
                  <p className="font-bold text-sm">{s.topic || s.course}</p>
                  <p className="text-blue-200 text-xs mt-1">🕐 {s.startTime} - {s.endTime}</p>
                  <p className="text-blue-200 text-xs">👤 {s.studentName || 'Học viên'} • Buổi {s.sessionNumber}</p>
                  <div className="flex justify-between items-center mt-2 gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      s.status === 'completed' ? 'bg-green-400/20 text-green-200'
                      : s.status === 'cancelled' ? 'bg-red-400/20 text-red-200'
                      : 'bg-blue-400/20 text-blue-200'
                    }`}>{s.status === 'completed' ? '✓ Hoàn thành' : s.status === 'cancelled' ? '✗ Đã hủy' : '● Sắp tới'}</span>
                    <div className="flex gap-1.5">
                      {s.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => onAttendance && onAttendance(s)}
                            className="flex items-center gap-1 text-[10px] bg-green-500/30 hover:bg-green-500/50 text-green-200 font-bold px-2 py-1 rounded-lg transition-all"
                            title="Điểm danh nhanh"
                          >
                            <UserCheck size={10} /> Điểm danh
                          </button>
                          <button
                            onClick={() => onEditSchedule(s)}
                            className="text-[10px] text-white/60 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-all"
                          >Sửa</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-blue-200 text-sm mt-2">Không có lịch dạy ngày này.</p>
          )}
        </div>

        {/* Upcoming list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-bold text-gray-700">📋 Buổi sắp tới trong tháng</h4>
          </div>
          <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
            {schedules.filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month)
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map(s => (
                <div key={s.id} className="px-5 py-3 flex items-center gap-3 hover:bg-blue-50/30 transition">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex flex-col items-center justify-center text-blue-600 flex-shrink-0">
                    <span className="text-[9px] font-bold">{monthNames[new Date(s.date).getMonth()].split(' ')[1]}</span>
                    <span className="text-sm font-black">{new Date(s.date).getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.topic}</p>
                    <p className="text-[10px] text-gray-400">{s.startTime} - {s.endTime} • {s.studentName || 'Học viên'}</p>
                  </div>
                </div>
              ))}
            {schedules.filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month).length === 0 && (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">Không có buổi nào sắp tới.</div>
            )}
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Tổng buổi', value: schedules.filter(s => new Date(s.date).getMonth() === month).length, color: 'bg-blue-50 text-blue-600' },
            { label: 'Đã dạy', value: schedules.filter(s => s.status === 'completed' && new Date(s.date).getMonth() === month).length, color: 'bg-green-50 text-green-600' },
            { label: 'Sắp tới', value: schedules.filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === month).length, color: 'bg-orange-50 text-orange-600' },
          ].map((st, i) => (
            <div key={i} className={`${st.color} rounded-xl p-3 text-center border border-current/10`}>
              <p className="text-xl font-black">{st.value}</p>
              <p className="text-[10px] font-bold uppercase">{st.label}</p>
            </div>
          ))}
        </div>
      </div>
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
              const count = rating.ratings.filter(r => Math.round(r.stars) === star).length;
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
                <StarIcons count={r.stars} />
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
    zalo: '',
    bio: '',
    specialty: '',
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
        zalo: currentTeacher.zalo || '',
        bio: currentTeacher.bio || '',
        specialty: currentTeacher.specialty || '',
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
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Số điện thoại</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <Phone size={16} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-bold text-gray-800">{currentTeacher?.phone || '—'}</span>
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

            {/* Zalo */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Zalo</label>
              {editingProfile ? (
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border-2 border-blue-200 focus-within:border-blue-400 transition">
                  <MessageSquare size={16} className="text-blue-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={profileForm.zalo}
                    onChange={e => setProfileForm({...profileForm, zalo: e.target.value})}
                    placeholder="Số Zalo hoặc link Zalo"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <MessageSquare size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{profileForm.zalo || '—'}</span>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
  const session = JSON.parse(localStorage.getItem('teacher_user') || '{}');
  const TEACHER_ID = session.id || 1;
  const {
    students: allStudents, teachers,
    getStudentsByTeacher, getTeacherStats,
    markAttendance: ctxMarkAttendance,
    updateStudentLink,
    notifications, getNotifications,
    getSchedulesByTeacher, getTeacherRating, RATING_CRITERIA,
    addSchedule, updateSchedule, cancelSchedule,
    revokeStudentExam, updateStudent, updateTeacher
  } = useData();

  const { socket } = useSocket();

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
    alert(`✅ Đã khoá bài thi của ${student.name} và gửi thông báo trực tiếp!`);
  };

  // Trạng thái hiện tại của GV
  const currentTeacher = teachers.find(t => String(t.id) === String(TEACHER_ID) || String(t._id) === String(TEACHER_ID));
  // Vấn đề: `teachers` ở frontend đôi lúc không chứa giáo viên hiện tại do phân quyền gọi getAll.
  // Giải pháp: Sử dụng thêm session.status để kiểm tra fallback chuẩn xác nhất.
  const currentStatus = String(currentTeacher?.status || session.status || '').toLowerCase();
  const isApproved = currentStatus === 'active';

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  const handleScheduleSubmit = (form) => {
    if (editingSchedule) {
      updateSchedule(editingSchedule.id, form);
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

  const students = getStudentsByTeacher(TEACHER_ID).map(s => ({
    ...s,
    displayName: getDisplayName(s),
    avatar: getDisplayName(s).substring(0, 2).toUpperCase(),
    color: (typeof s.id === 'number' ? s.id : 0) % 2 === 1 ? 'bg-purple-500' : 'bg-blue-500',
  }));
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

  const markAttendance = (id, noteParam, gradeParam) => {
    const note = noteParam || noteInputs[id] || 'Đã điểm danh';
    const grade = gradeParam !== undefined ? gradeParam : (gradeInputs[id] || 0);
    ctxMarkAttendance(id, note, Number(grade));
    toast.success('Đã điểm danh thành công!');
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
  const teacherRating = useMemo(() => getTeacherRating(TEACHER_ID), [getTeacherRating, TEACHER_ID]);
  const myNotifs = getNotifications(TEACHER_ID, 'teacher').filter(n => !n.read).length;

  // ── MÀN HÌNH CHỜ DUYỆT ── chỉ hiện nút Bài Test
  if (session.role === 'teacher' && currentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
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
    <div className="min-h-screen bg-slate-50">
      {/* Popup thông báo — hiện 1 lần/ngày */}
      <PopupBanner role="teacher" />

      <div className="min-w-0 pt-4">
        {/* Topbar removed - using DashboardLayout header */}


        {/* ═══ CONTENT ═══ */}
        {currentHash === 'students' ? (
          /* ═══ QUẢN LÝ HỌC VIÊN ═══ */
          <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <GraduationCap size={20} className="text-blue-600" /> Quản lý học viên
                <span className="text-sm font-normal text-gray-500">({students.length})</span>
              </h2>
              {/* Search bar */}
              <div className="relative max-w-xs w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Tìm học viên..."
                  className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
            </div>
            {students
              .filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.course?.toLowerCase().includes(studentSearch.toLowerCase()))
              .map(student => (
                <StudentCard key={student.id} student={student}
                  onAttendance={markAttendance} onUpdateLink={updateLink}
                  onSaveGrade={saveGrade} onUpdateNotes={updateNotes}
                  onLockExam={lockStudentExam} />
              ))
            }
            {students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase())).length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Search size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Không tìm thấy học viên nào</p>
              </div>
            )}
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
            <MonthlyCalendar schedules={mySchedules} onEditSchedule={startEditSchedule} />
          </div>

        ) : currentHash === 'profile' ? (
          /* ═══ HỒ SƠ CÁ NHÂN ═══ */
          <TeacherProfileSection teacherId={TEACHER_ID} currentTeacher={currentTeacher} />

        ) : (
          /* ═══ TỔNG QUAN ═══ */
          <div className="px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: 'Học viên', value: students.length, sub: 'trong lớp', color: 'from-blue-500 to-blue-600' },
                { icon: BookOpen, label: 'Buổi đã dạy', value: totalDone, sub: `/ ${totalSess} buổi`, color: 'from-purple-500 to-purple-600' },
                { icon: Star, label: 'Điểm TB', value: avgGrade, sub: '/ 10 điểm', color: 'from-orange-500 to-orange-600' },
                { icon: Award, label: 'Hoàn thành', value: completed, sub: `/ ${students.length} HV`, color: 'from-green-500 to-green-600' },
              ].map(({ icon: Icon, label, value, sub, color }) => (
                <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4 hover:shadow-md transition-shadow">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-md`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <p className="text-2xl font-black text-gray-800">{value}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
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
    </div>
  );
};

export default TeacherDashboard;
