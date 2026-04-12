import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  PlayCircle, Clock, CheckCircle, MessageSquare, Download, HelpCircle,
  FileUp, BookOpen, Star, TrendingUp, Phone,
  Zap, Calendar, Video, FileText, ClipboardList,
  ChevronRight, AlertCircle, XCircle, ExternalLink, User, Settings
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import ClassReminder from './ClassReminder';
import { useData } from '../context/DataContext';
import PopupBanner from './PopupBanner';
import TuitionPaymentModal from './TuitionPaymentModal';
import StudentProfileUpdateModal from './StudentProfileUpdateModal';
import api from '../services/api';
import { useModal } from '../utils/Modal.jsx';


// ─── Sub-components ─────────────────────────────────────────────────────────

const MilestoneEvaluationModal = ({ milestone, studentId, teacherId, courseName, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState({ 
    satisfied: 'yes', 
    lessonClear: 'yes', 
    comment: '' 
  });

  const handleSubmit = () => {
    onSubmit({
      studentId,
      teacherId,
      milestone,
      courseName,
      criteria: {
        satisfied: feedback.satisfied,
        lessonClear: feedback.lessonClear,
      },
      comment: feedback.comment
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-8 text-center text-white relative">
            <p className="text-sm mt-1">Khóa học: {courseName}</p>
           <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
             <Star size={32} className="fill-white text-white" />
           </div>
           <h3 className="text-xl font-black uppercase tracking-tight">Đánh giá chất lượng</h3>
           <p className="text-red-100 text-[10px] mt-1 font-medium italic">Gửi trực tiếp Admin (Giáo viên không thấy phần này)</p>
        </div>
        
        <div className="p-6 space-y-6">
           <p className="text-sm text-gray-600 leading-relaxed text-center font-medium">
             Chào {milestone === 'lesson_1' ? 'buổi học đầu tiên' : 'mốc 50% khóa học'}! Hãy cho Admin biết cảm nhận của bạn nhé.
           </p>

           <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-xs font-bold text-gray-700">Bạn hài lòng với Thầy?</span>
                <div className="flex gap-2">
                  {['yes', 'no'].map(v => (
                    <button key={v} onClick={() => setFeedback({...feedback, satisfied: v})}
                      className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${feedback.satisfied === v ? 'bg-red-500 text-white shadow-md shadow-red-200' : 'bg-white text-gray-400 border border-gray-200'}`}>
                      {v === 'yes' ? 'HÀI LÒNG' : 'CHƯA'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <span className="text-xs font-bold text-gray-700">Giảng bài dễ hiểu?</span>
                <div className="flex gap-2">
                  {['yes', 'no'].map(v => (
                    <button key={v} onClick={() => setFeedback({...feedback, lessonClear: v})}
                      className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${feedback.lessonClear === v ? 'bg-red-500 text-white shadow-md shadow-red-200' : 'bg-white text-gray-400 border border-gray-200'}`}>
                      {v === 'yes' ? 'RẤT HIỂU' : 'HƠI KHÓ'}
                    </button>
                  ))}
                </div>
              </div>
              
              <textarea 
                value={feedback.comment}
                onChange={e => setFeedback({...feedback, comment: e.target.value})}
                placeholder="Lời nhắn riêng cho Admin (bắt buộc)..."
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm outline-none focus:border-red-400 focus:bg-white transition-all h-24 italic"
              />
           </div>

           <button onClick={handleSubmit} disabled={!feedback.comment.trim()}
             className="w-full bg-gradient-to-r from-red-600 to-red-500 py-4 rounded-2xl text-white font-black text-sm shadow-xl shadow-red-100 active:scale-95 transition transform disabled:opacity-50">
             GỬI ĐÁNH GIÁ RIÊNG
           </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-gray-100">
    <div className={`w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-2 shadow-md`}>
      <Icon size={16} className="text-white" />
    </div>
    <p className="text-[10px] md:text-xs text-gray-500">{label}</p>
    <p className="text-lg md:text-xl font-black text-gray-800">
      {value} <span className="text-[10px] md:text-xs font-normal text-gray-400">{sub}</span>
    </p>
  </div>
);

// ─── Schedule Section ───────────────────────────────────────────────────────

const ScheduleView = ({ schedules, student }) => {
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

  // Group schedules
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

  const selectedSchedules = selectedDate ? (scheduleMap[selectedDate] || []) : [];

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Lịch tháng */}
      <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">Lịch theo tháng</h3>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
              <ChevronRight size={18} className="text-slate-500 rotate-180" />
            </button>
            <span className="text-sm font-bold text-slate-700 min-w-[120px] text-center">
              {monthNames[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
              <ChevronRight size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center px-4 pt-4">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
            <div key={d} className={`text-[11px] font-black py-2 ${i === 0 ? 'text-red-500' : 'text-slate-400'}`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 pb-6 gap-1 md:gap-2">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;
            const hasSchedule = scheduleMap[day]?.length > 0;
            const daySchedules = scheduleMap[day] || [];
            const hasUpcoming = daySchedules.some(s => s.status === 'scheduled');
            const hasCompleted = daySchedules.some(s => s.status === 'completed');
            const isSelected = selectedDate === day;

            return (
              <button key={day} onClick={() => setSelectedDate(day === selectedDate ? null : day)}
                className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-bold transition-all ${
                  isSelected ? 'bg-blue-600 text-white shadow-xl ring-4 ring-blue-100 scale-105 z-10' :
                  isToday(day) ? 'bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200' :
                  hasSchedule ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {day}
                {hasSchedule && (
                  <div className="flex gap-1 mt-1">
                    {hasUpcoming && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                    {hasCompleted && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-green-300' : 'bg-green-500'}`} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chi tiết lịch */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-gradient-to-br from-[#203DB5] to-[#1E3A8A] rounded-3xl p-6 text-white shadow-xl">
          <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-yellow-400" />
            {selectedDate
              ? `Ngày ${selectedDate}/${month + 1}/${year}`
              : `Hôm nay — ${today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}`
            }
          </p>
          
          {selectedSchedules.length > 0 ? (
            <div className="space-y-4">
              {selectedSchedules.map(s => (
                <div key={s.id} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:bg-white/20 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-extrabold text-base leading-tight">{s.topic || s.course}</h4>
                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase whitespace-nowrap ${
                      s.status === 'completed' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-blue-400/20 text-blue-200'
                    }`}>
                      {s.status === 'completed' ? 'Đã xong' : 'Sắp tới'}
                    </span>
                  </div>
                  <p className="text-blue-100 text-xs font-semibold">🕐 {s.startTime} - {s.endTime}</p>
                  <p className="text-blue-100 text-xs font-semibold mt-0.5">👤 GV: {s.teacherName}</p>
                  
                  {s.status === 'scheduled' && (
                    <div className="flex gap-2 mt-4">
                       {s.linkHoc && (
                         <a href={s.linkHoc} target="_blank" rel="noreferrer" className="flex-1 bg-white text-blue-900 py-2.5 rounded-xl text-xs font-black text-center shadow-[0_4px_15px_rgba(0,0,0,0.1)] active:scale-95 transition-all">
                           VÀO LỚP
                         </a>
                       )}
                       <button className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white py-2.5 rounded-xl text-xs font-black text-center transition-all">
                           XIN HỌC BÙ
                       </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-blue-200/60 font-bold border-2 border-dashed border-white/10 rounded-2xl">
              Không có lịch học ngày này.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Materials Section ──────────────────────────────────────────────────────

const MaterialsView = ({ trainingData, courseName, studentQuestions }) => {
  const [activeTab, setActiveTab] = useState('videos');
  const [searchQuery, setSearchQuery] = useState('');

  const tabs = [
    { key: 'videos', label: 'Video học', icon: Video, color: 'text-purple-600', bgActive: 'bg-purple-100 text-purple-700' },
    { key: 'files', label: 'Tài liệu', icon: FileText, color: 'text-blue-600', bgActive: 'bg-blue-100 text-blue-700' },
    { key: 'guides', label: 'Bài tập', icon: ClipboardList, color: 'text-orange-600', bgActive: 'bg-orange-100 text-orange-700' },
    { key: 'questions', label: 'Ôn tập', icon: HelpCircle, color: 'text-green-600', bgActive: 'bg-green-100 text-green-700' },
  ];

  const currentList = trainingData?.[activeTab] || [];
  const filtered = currentList.filter(m => 
    (m.title?.toLowerCase().includes(searchQuery.toLowerCase()) || m.desc?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const typeColors = {
    VIDEO: 'bg-purple-500', PDF: 'bg-red-500', XLSX: 'bg-green-500', PPTX: 'bg-orange-500', DOCX: 'bg-blue-500',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Tab bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2 flex-1 relative z-10">
          <div className="flex gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === tab.key ? `${tab.bgActive} shadow-sm` : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}>
                  <Icon size={16} />
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? 'bg-white/60' : 'bg-slate-100'
                  }`}>{trainingData?.[tab.key]?.length || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Search */}
        <div className="md:w-64 relative z-10">
           <input 
             type="text" 
             value={searchQuery}
             onChange={e => setSearchQuery(e.target.value)}
             placeholder={`Tìm ${tabs.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
             className="w-full h-full min-h-[48px] pl-10 pr-4 bg-white border border-slate-100 rounded-2xl shadow-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 font-medium text-sm transition-all"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        </div>
      </div>
      {/* Content */}
      {activeTab === 'videos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group hover:shadow-md transition-shadow">
              {/* Video thumbnail placeholder */}
              <div className="h-36 bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center relative cursor-pointer" onClick={() => window.open(m.url, '_blank')}>
                <PlayCircle size={48} className="text-white/80 group-hover:scale-110 transition-transform" />
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded">{m.duration || '00:00'}</div>
              </div>
              <div className="p-4">
                <h4 className="font-bold text-sm text-gray-800 mb-1">{m.title}</h4>
                <p className="text-[10px] text-gray-400">{(m.desc?.replace(/<[^>]*>/g, '') || '')}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">📅 {m.createdAt}</span>
                  <a href={m.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition flex items-center gap-1">
                    <PlayCircle size={10} /> Xem
                  </a>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="md:col-span-2 text-center py-12 text-gray-400">
              <Video size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có video nào.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map(m => (
              <div key={m.id} className="px-4 md:px-6 py-4 flex items-center justify-between hover:bg-blue-50/30 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl ${typeColors[m.fileType] || 'bg-gray-400'} flex items-center justify-center text-white text-[10px] font-black flex-shrink-0`}>
                    {m.fileType || 'FILE'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">{m.title}</p>
                    <p className="text-[10px] text-gray-400">{(m.desc?.replace(/<[^>]*>/g, '') || '')} • {m.fileSize}</p>
                  </div>
                </div>
                <button className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition flex-shrink-0 group-hover:bg-blue-100">
                  <Download size={16} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Chưa có tài liệu nào.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'guides' && (
        <div className="space-y-4">
          {filtered.map(m => {
            return (
              <div key={m.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all hover:shadow-md border-slate-100`}>
                <div className="px-4 md:px-6 py-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-100 text-blue-600 text-2xl`}>
                        {m.icon || '📝'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                           <h4 className="font-bold text-base text-slate-800">{m.title}</h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{(m.desc?.replace(/<[^>]*>/g, '') || '')}</p>
                        
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">📅 Ngày tạo: {m.createdAt}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-row md:flex-col gap-2 flex-shrink-0 mt-2 md:mt-0">
                      <button className="flex-1 justify-center text-xs font-bold text-slate-600 bg-slate-100 px-4 py-2 rounded-xl hover:bg-slate-200 transition flex items-center gap-2">
                        <Download size={14} /> Tải bài tập
                      </button>
                      <button className={`flex-1 justify-center text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-sm bg-blue-50 text-blue-600 hover:bg-blue-100`}>
                        <FileUp size={14} /> Nộp bài
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có bài tập nào.</p>
            </div>
          )}
        </div>
      )}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {(studentQuestions || []).filter(q => !searchQuery || q.q.toLowerCase().includes(searchQuery.toLowerCase())).map((q, idx) => (
            <div key={q.id || idx} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 group hover:border-green-300 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-xs font-black text-green-600 flex-shrink-0">{idx + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-green-100 text-green-700 uppercase">{q.section || 'Tổng hợp'}</span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{q.type === 'essay' ? 'Tự luận' : 'Trắc nghiệm'}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 leading-relaxed mb-3">{q.q}</h4>
                  
                  {q.type === 'multiple' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(q.options || []).map((opt, i) => (
                        <div key={i} className={`px-4 py-2.5 rounded-xl border text-xs flex items-center gap-3 ${q.correct === i ? 'border-green-200 bg-green-50/50 font-bold text-green-700' : 'border-slate-50 text-slate-500'}`}>
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${q.correct === i ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{['A', 'B', 'C', 'D'][i]}</span>
                          {opt}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {q.sampleAnswer && (
                        <div className="bg-slate-50 p-4 rounded-xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Gợi ý trả lời:</p>
                          <p className="text-xs text-slate-600 italic leading-relaxed">{q.sampleAnswer}</p>
                        </div>
                      )}
                      {q.attachedFile && (
                        <button className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl text-[10px] font-bold hover:bg-green-100 transition">
                          <Download size={14} /> Tải file đính kèm: {q.attachedFile}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(!studentQuestions || studentQuestions.length === 0) && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-slate-200">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Ngân hàng câu hỏi đang được cập nhật...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Evaluation Section ─────────────────────────────────────────────────────

const EvaluationView = ({ 
  studentData, 
  evaluatingCourseId, 
  setEvaluatingCourseId, 
  STUDENT_ID, 
  submitPrivateEvaluation,
  getTeacherRating,
  ratingSubmitted,
  setRatingSubmitted,
  isEditingRating,
  setIsEditingRating,
  ratingCriteria,
  setRatingCriteria,
  ratingComment,
  setRatingComment,
  RATING_CRITERIA,
  rateTeacher,
  privateEvaluations
}) => {
  const [privateForm, setPrivateForm] = useState({ satisfied: 'yes', lessonClear: 'yes', comment: '' });
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'teacher'

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-8 animate-in fade-in duration-500">
      {/* Introduction */}
      <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
            <Star size={32} className="text-white fill-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black">Trung tâm Lắng nghe Bạn!</h2>
            <p className="text-yellow-100 text-sm mt-1 max-w-lg">Phản hồi của bạn giúp chúng tôi cải thiện chất lượng giảng dạy. Mọi đánh giá riêng cho Admin đều được bảo mật 100%.</p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto border border-slate-200/50">
        <button 
          onClick={() => setActiveTab('admin')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'admin' ? 'bg-white text-red-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <AlertCircle size={14} /> Gửi Phản hồi Admin
        </button>
        <button 
          onClick={() => setActiveTab('teacher')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'teacher' ? 'bg-white text-yellow-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User size={14} /> Đánh giá Giảng viên
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'admin' ? (
          /* ═══ TAB: ADMIN FEEDBACK ═══ */
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <BookOpen size={20} className="text-blue-500" /> Phản hồi về khóa học (Bảo mật)
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {studentData.courses?.length > 0 ? studentData.courses.map(c => {
                const existingEval = privateEvaluations?.find(ev => 
                  String(ev.studentId) === String(STUDENT_ID) && 
                  ev.courseName === c.name && 
                  ev.milestone === 'manual_feedback'
                );
                const isEvaluating = evaluatingCourseId === c.id;

                return (
                  <div key={c.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
                     <div className="p-6 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                         <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-lg">
                           {c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                         </div>
                         <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                             <h4 className="font-bold text-slate-800">{c.name}</h4>
                             {existingEval && (
                               <span className="bg-green-100 text-green-700 text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase flex items-center gap-1">
                                 <CheckCircle size={8} /> Đã gửi
                               </span>
                             )}
                           </div>
                           <p className="text-xs text-slate-400 font-medium tracking-tight">GV: {c.teacherName || studentData.teacher}</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => {
                           setEvaluatingCourseId(isEvaluating ? null : c.id);
                           if (existingEval) {
                             setPrivateForm({ 
                               satisfied: existingEval.criteria?.satisfied || 'yes', 
                               lessonClear: existingEval.criteria?.lessonClear || 'yes', 
                               comment: existingEval.comment || '' 
                             });
                           } else {
                             setPrivateForm({ satisfied: 'yes', lessonClear: 'yes', comment: '' });
                           }
                         }}
                         className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                           isEvaluating ? 'bg-slate-100 text-slate-500' : 
                           existingEval ? 'bg-green-50 text-green-600 hover:bg-green-100 shadow-sm' : 
                           'bg-red-50 text-red-600 hover:bg-red-100 shadow-sm'
                         }`}>
                         {isEvaluating ? 'Đóng form' : existingEval ? 'Sửa Phản hồi' : 'Gửi Phản hồi'}
                       </button>
                     </div>

                     {isEvaluating && (
                       <div className="px-6 pb-6 animate-in slide-in-from-top-4 duration-300">
                          <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-6">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="space-y-3">
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Mức độ hài lòng với trung tâm?</p>
                                 <div className="flex gap-2">
                                   {[
                                     { label: 'RẤT HÀI LÒNG', val: 'yes' },
                                     { label: 'BÌNH THƯỜNG', val: 'no' }
                                   ].map(v => (
                                     <button 
                                       key={v.val} 
                                       onClick={() => setPrivateForm(prev => ({ ...prev, satisfied: v.val }))}
                                       className={`flex-1 py-3 border-2 rounded-2xl text-[10px] font-black transition-all uppercase ${
                                         privateForm.satisfied === v.val ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-red-200'
                                       }`}
                                     >
                                       {v.label}
                                     </button>
                                   ))}
                                 </div>
                               </div>
                               <div className="space-y-3">
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Giảng viên dạy dễ hiểu không?</p>
                                 <div className="flex gap-2">
                                   {[
                                     { label: 'DỄ HIỂU', val: 'yes' },
                                     { label: 'HƠI KHÓ HIỂU', val: 'no' }
                                   ].map(v => (
                                     <button 
                                       key={v.val} 
                                       onClick={() => setPrivateForm(prev => ({ ...prev, lessonClear: v.val }))}
                                       className={`flex-1 py-3 border-2 rounded-2xl text-[10px] font-black transition-all uppercase ${
                                         privateForm.lessonClear === v.val ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-red-200'
                                       }`}
                                     >
                                       {v.label}
                                     </button>
                                   ))}
                                 </div>
                               </div>
                             </div>

                             <div className="space-y-2">
                               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Góp ý riêng cho Admin điều chỉnh (Bảo mật):</p>
                               <textarea 
                                 value={privateForm.comment}
                                 onChange={e => setPrivateForm(prev => ({ ...prev, comment: e.target.value }))}
                                 placeholder="Nhập điều bạn chưa hài lòng hoặc muốn trung tâm cải thiện..."
                                 className="w-full bg-white border border-slate-100 rounded-2xl p-5 text-sm font-medium outline-none focus:border-red-500 transition-all h-32 shadow-inner"
                               />
                             </div>

                             <button 
                               onClick={() => {
                                 submitPrivateEvaluation({
                                   studentId: STUDENT_ID,
                                   teacherId: c.teacherId || studentData.teacherId,
                                   milestone: 'manual_feedback',
                                   courseName: c.name,
                                   comment: privateForm.comment || 'Sinh viên phản hồi qua tab Admin',
                                   criteria: { satisfied: privateForm.satisfied, lessonClear: privateForm.lessonClear }
                                 });
                                 setEvaluatingCourseId(null);
                                 showModal({ 
                                     title: 'Hệ thống ghi nhận', 
                                     content: 'Admin đã nhận được phản hồi. Cảm ơn bạn đã góp ý giúp trung tâm tốt hơn!', 
                                     type: 'success' 
                                 });
                               }}
                               className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 py-4 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl shadow-red-100"
                             >
                               <Star size={18} className="fill-white" /> {existingEval ? 'CẬP NHẬT PHẢN HỒI' : 'GỬI PHẢN HỒI RIÊNG CHO ADMIN'}
                             </button>
                             <p className="text-[9px] text-center text-slate-400 italic">Mọi thông tin bạn gửi ở đây Giảng viên sẽ KHÔNG biết.</p>
                          </div>
                       </div>
                     )}
                  </div>
                );
              }) : (
                <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-slate-100">
                  <BookOpen size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-400 font-bold">Chưa có khóa học nào để phản hồi.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ═══ TAB: TEACHER RATING ═══ */
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Star size={24} className="text-yellow-500 fill-yellow-500" /> Đánh giá Giảng viên (Công khai)
              </h3>
            </div>
            
            {studentData.teacherId && (() => {
              const teacherRating = getTeacherRating(studentData.teacherId);
              const existingRating = teacherRating.ratings.find(r => String(r.studentId) === String(STUDENT_ID));
              const hasRated = existingRating || ratingSubmitted;
              const isEditing = isEditingRating;
              const showForm = !hasRated || isEditing;

              return (
                <div className="bg-white rounded-[40px] p-8 md:p-12 border border-slate-100 shadow-xl space-y-10">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-24 h-24 bg-gradient-to-br from-yellow-100 to-orange-50 rounded-3xl flex items-center justify-center text-yellow-600 font-black text-4xl shadow-inner border border-yellow-200/50">
                      {studentData.teacher?.split(' ').slice(-1)[0][0]}
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-800">{studentData.teacher}</h4>
                      <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Giảng viên trực tiếp</p>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 w-full opacity-50"></div>

                  {hasRated && !isEditing ? (
                    <div className="bg-yellow-50/50 rounded-[32px] p-8 border border-yellow-100 space-y-6 text-center">
                       <div className="flex flex-col items-center gap-2">
                          <span className="text-5xl font-black text-yellow-600 tracking-tighter">{existingRating?.stars || 5}</span>
                          <div className="flex gap-1.5">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} size={24} className={i < Math.round(existingRating?.stars || 5) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} />
                            ))}
                          </div>
                          <p className="text-[10px] font-black text-yellow-700/50 uppercase tracking-widest mt-2">Điểm bạn đã đánh giá</p>
                       </div>
                       {existingRating?.comment && (
                         <div className="relative pt-4 italic">
                           <span className="absolute -left-2 -top-2 text-4xl text-yellow-200 opacity-50">"</span>
                           <p className="text-sm text-slate-600 leading-relaxed">"{existingRating.comment}"</p>
                         </div>
                       )}
                       <button onClick={() => setIsEditingRating(true)} className="px-8 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 hover:text-slate-600 hover:border-yellow-200 uppercase tracking-widest flex items-center justify-center gap-2 mx-auto transition-all">
                         <Settings size={14} /> Cập nhật lại đánh giá
                       </button>
                    </div>
                  ) : showForm ? (
                    <div className="space-y-8">
                      {RATING_CRITERIA && Object.entries(RATING_CRITERIA).map(([catKey, cat]) => (
                        <div key={catKey} className="space-y-3">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">{cat.label}</p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {cat.options.map(opt => (
                              <button key={opt.key}
                                onClick={() => setRatingCriteria(prev => ({ ...prev, [catKey]: opt.key }))}
                                className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all border-2 ${
                                  ratingCriteria[catKey] === opt.key ? 'bg-yellow-500 border-yellow-500 text-white shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-400 hover:border-yellow-200'
                                }`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      <div className="space-y-3">
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Lời nhắn cho Giảng viên:</p>
                        <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)}
                          placeholder="Nhập cảm nhận, lời khen hoặc góp ý xây dựng cho Giảng viên..."
                          className="w-full bg-slate-50 border border-slate-100 rounded-[32px] p-6 text-sm font-medium outline-none focus:border-yellow-400 focus:bg-white transition-all h-32 shadow-inner" />
                      </div>

                      <button 
                        onClick={() => {
                          rateTeacher(studentData.teacherId, STUDENT_ID, ratingCriteria, ratingComment);
                          setRatingSubmitted(true);
                          setIsEditingRating(false);
                        }}
                        className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 py-5 rounded-[28px] text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-yellow-200 transition-all active:scale-[0.98]"
                      >
                        GỬI ĐÁNH GIÁ CÔNG KHAI
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const StudentDashboard = ({ onNavigate }) => {
  const [activeCourseName, setActiveCourseName] = useState('');
  const [evaluatingCourseId, setEvaluatingCourseId] = useState(null);
  const { showModal } = useModal();
  const session = JSON.parse(localStorage.getItem('student_user') || '{}');
  const STUDENT_ID = session.id || 101;
  const { students, teachers, materials, schedules, getNotifications, getSchedulesByStudent, rateTeacher, getTeacherRating, RATING_CRITERIA, privateEvaluations, submitPrivateEvaluation, studentTrainingData, studentQuestions } = useData();
  const student = students.find(s => String(s.id) === String(STUDENT_ID));
  const navigate = useNavigate();
  const location = useLocation();

  const studentData = useMemo(() => {
    if (!student) return null;
    
    // Properly handle populated vs unpopulated `teacherId`
    const actualTeacherId = (typeof student.teacherId === 'object' && student.teacherId !== null) 
      ? student.teacherId._id || student.teacherId.id 
      : student.teacherId;
      
    const teacherRecord = teachers?.find(t => String(t.id) === String(actualTeacherId));
    
    const extractedTeacherName = (typeof student.teacherId === 'object' && student.teacherId?.name) 
      ? student.teacherId.name 
      : (student.teacherName || teacherRecord?.name);
      
    const extractedTeacherPhone = (typeof student.teacherId === 'object' && student.teacherId?.phone) 
      ? student.teacherId.phone 
      : (teacherRecord?.phone || student.zalo || '');

    return {
      ...student,
      teacher: extractedTeacherName ? `Thầy ${extractedTeacherName}` : 'Chưa phân công',
      teacherId: actualTeacherId,
      teacherZalo: extractedTeacherPhone,
      attendanceHistory: student.grades || [],
      // Cung cấp mảng courses từ trường course đơn lẻ nếu cần
      courses: (student.courses && student.courses.length > 0) 
        ? student.courses 
        : (student.course ? [{ 
            id: 'main', 
            name: student.course, 
            teacherId: actualTeacherId, 
            teacherName: extractedTeacherName || student.teacherName || 'Chưa phân công',
            completedSessions: student.sessionsCompleted || (student.totalSessions - student.remainingSessions) || 0,
            totalSessions: student.totalSessions || 12,
            avgGrade: student.avgGrade || 0,
            registeredAt: student.createdAt || new Date(),
            status: student.status === 'Hoàn thành' ? 'completed' : 'active'
          }] : []),
      completedSessions: student.sessionsCompleted || (student.totalSessions - student.remainingSessions) || 0,
      totalSessions: student.totalSessions || 12,
    };
  }, [student, teachers]);

  const progressPct = useMemo(() => {
    if (!studentData || !studentData.totalSessions) return 0;
    const pct = Math.round((studentData.completedSessions / studentData.totalSessions) * 100);
    return isNaN(pct) ? 0 : pct;
  }, [studentData]);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const fileRef = useRef(null);
  const [showTuitionModal, setShowTuitionModal] = useState(false);
  const [showUpdateProfileModal, setShowUpdateProfileModal] = useState(false);

  // ─── Assignments State ───
  const [myAssignments, setMyAssignments] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [submissionLink, setSubmissionLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStudentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("File bài làm quá lớn. Xin vui lòng giới hạn dưới 3MB!");
      e.target.value = '';
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.assignments.uploadFile(file);
      if (res.success) {
        setSubmissionLink(res.fileUrl);
      } else {
        alert(res.message || "Lỗi tải file");
      }
    } catch(err) {
      alert("Lỗi mạng khi tải file");
    }
    setIsSubmitting(false);
    e.target.value = '';
  };

  useEffect(() => {
    if (studentData && studentData.course) {
      api.assignments.getByStudentAndCourse(STUDENT_ID, studentData.course)
        .then(res => {
          if (res.success) setMyAssignments(res.data);
        })
        .catch(console.error);
    }
  }, [studentData?.course, STUDENT_ID]);

  // Hash-based section
  const currentHash = location.hash?.replace('#', '') || '';

  // Rating state
  const [ratingCriteria, setRatingCriteria] = useState({ teaching: '', voice: '', guidance: '', support: '' });
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [isEditingRating, setIsEditingRating] = useState(false);

  const mySchedules = useMemo(() => getSchedulesByStudent(STUDENT_ID), [getSchedulesByStudent, STUDENT_ID]);
  const myMaterials = useMemo(() =>
    materials.filter(m => student?.course?.includes(m.course) || m.course?.includes('THVP NÂNG CAO')),
    [materials, student]
  );
  
  const teacherRatingData = useMemo(() => {
    if (!studentData?.teacherId) return { avg: 0, count: 0, ratings: [] };
    return getTeacherRating(studentData.teacherId);
  }, [getTeacherRating, studentData?.teacherId]);

  const isNew = studentData?.completedSessions === 0;

  const [activeMilestone, setActiveMilestone] = useState(null);

  // Check for milestone evaluations
  useEffect(() => {
    if (!studentData?.id || !studentData?.teacherId) return;

    const milestones = [];
    if (studentData.completedSessions === 1) milestones.push('lesson_1');
    if (studentData.completedSessions >= studentData.totalSessions / 2 && studentData.completedSessions < (studentData.totalSessions / 2) + 1) milestones.push('mid_course');

    for (const m of milestones) {
      const alreadyDone = privateEvaluations.some(e => e.studentId === studentData.id && e.milestone === m);
      if (!alreadyDone) {
        setTimeout(() => setActiveMilestone(m), 2000); // Show after 2s delay
        break; 
      }
    }
  }, [studentData?.completedSessions, studentData?.id, studentData?.totalSessions, privateEvaluations]);

  const myNotifs = getNotifications(STUDENT_ID, 'student').filter(n => !n.read).length;

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (f) { setUploadFile(f); setTimeout(() => setUploadDone(true), 1500); }
  };

  if (!studentData) return <div className="p-20 text-center text-gray-500">Không tìm thấy học viên.</div>;

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-transparent font-sans h-full">
      {/* Popup thông báo — hiện 1 lần/ngày */}
      <PopupBanner role="student" />

      {/* Modal đóng học phí (tự động qua SePay) */}
      {showTuitionModal && (
        <TuitionPaymentModal
          student={studentData}
          onClose={() => setShowTuitionModal(false)}
          onPaid={() => { setShowTuitionModal(false); window.location.reload(); }}
        />
      )}

      {/* Modal cập nhật hồ sơ cá nhân */}
      {showUpdateProfileModal && (
        <StudentProfileUpdateModal
          student={studentData}
          onClose={() => setShowUpdateProfileModal(false)}
        />
      )}

      {/* Modal Nộp bài tập */}
      {activeAssignment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <FileUp size={20} className="text-blue-600" /> Nộp bài tập
              </h3>
              <button onClick={() => setActiveAssignment(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 bg-white hover:bg-red-50 rounded-xl">
                <XCircle size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <p className="text-xs text-slate-500 uppercase font-black tracking-widest mb-1">Tên bài tập</p>
                <p className="font-bold text-slate-800 text-lg">{activeAssignment.title}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Link bài làm hoặc Tải file lên</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="url"
                      placeholder="https://drive.google.com/... hoặc link file" 
                      className="flex-1 border-2 border-slate-200 focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all placeholder:text-slate-300 font-medium"
                      value={submissionLink}
                      onChange={(e) => setSubmissionLink(e.target.value)}
                    />
                    <label className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-3 rounded-xl cursor-pointer transition flex items-center justify-center font-bold" title="Tải file trực tiếp (Tối đa 3MB)">
                      {isSubmitting ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <FileUp size={20} />}
                      <input type="file" className="hidden" onChange={handleStudentUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" disabled={isSubmitting} />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic">* Tối đa 3MB (PDF, Word, Excel, ZIP, RAR). Nhớ mở quyền truy cập nếu là link Drive.</p>
                </div>
                <button
                  disabled={!submissionLink || isSubmitting}
                  onClick={() => {
                    setIsSubmitting(true);
                    api.assignments.submit(activeAssignment._id, { studentId: STUDENT_ID, teacherId: studentData.teacherId, submittedFileUrl: submissionLink })
                      .then(res => {
                        setIsSubmitting(false);
                        if (res.success) {
                          setMyAssignments(prev => prev.map(a => a._id === activeAssignment._id ? { ...a, mySubmission: res.data } : a));
                          setActiveAssignment(null);
                          setSubmissionLink('');
                        }
                      }).catch(err => setIsSubmitting(false));
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] mt-4"
                >
                  {isSubmitting ? 'Đang nộp...' : 'Xác nhận Nộp bài'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0">
        {/* ClassReminder */}
        <ClassReminder
          nextClassTime={studentData.nextClassTime}
          linkHoc={studentData.linkHoc}
          courseName={studentData.course}
          studentName={studentData.name}
        />


        {/* Topbar removed - using DashboardLayout header */}
        <div className="pt-4"></div> {/* Temporary empty div to keep spacing if needed, or better: remove and use margin */}
        
        {/* ═══ CONTENT — Switch based on hash ═══ */}
        {currentHash === 'schedule' ? (
          /* ═══ LỊCH HỌC ═══ */
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <Calendar size={20} className="text-blue-500" /> Lịch học của tôi
              </h2>
              <span className="text-xs text-gray-400">
                {mySchedules?.filter(s => s.status === 'completed').length || 0}/{studentData.totalSessions} buổi hoàn thành
              </span>
            </div>
            <ScheduleView schedules={mySchedules} student={studentData} />

            {/* Nhật ký điểm danh & nhận xét */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={20} className="text-emerald-500" />
                <h3 className="font-bold text-gray-800 text-lg">Nhật ký học tập & Điểm số</h3>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {studentData.grades && studentData.grades.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {studentData.grades.map((g, idx) => (
                      <div key={idx} className="p-4 hover:bg-gray-50 flex items-start justify-between transition-colors">
                        <div>
                          <p className="font-bold text-gray-800 flex items-center gap-2">
                            {g.date}
                            <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full uppercase">Điểm danh</span>
                          </p>
                          <p className="text-sm text-gray-600 mt-1">{g.note}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-black ${g.grade >= 5 ? 'text-green-600' : 'text-red-500'}`}>
                            {g.grade > 0 ? `${g.grade}/10` : '--'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    Chưa có dữ liệu điểm danh.
                  </div>
                )}
              </div>
            </div>
          </div>

        ) : currentHash === 'materials' ? (
          /* ═══ TÀI LIỆU KHÓA HỌC ═══ */
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <BookOpen size={20} className="text-purple-500" /> Tài liệu khóa học
              </h2>
              <span className="text-xs text-gray-400">{studentTrainingData ? (studentTrainingData.videos?.length + studentTrainingData.files?.length + studentTrainingData.guides?.length) : 0} tài liệu</span>
            </div>
            <MaterialsView trainingData={studentTrainingData} courseName={studentData.course} studentQuestions={studentQuestions} />
          </div>

        ) : currentHash === 'evaluation' ? (
          <EvaluationView 
            studentData={studentData}
            evaluatingCourseId={evaluatingCourseId}
            setEvaluatingCourseId={setEvaluatingCourseId}
            STUDENT_ID={STUDENT_ID}
            submitPrivateEvaluation={submitPrivateEvaluation}
            getTeacherRating={getTeacherRating}
            ratingSubmitted={ratingSubmitted}
            setRatingSubmitted={setRatingSubmitted}
            isEditingRating={isEditingRating}
            setIsEditingRating={setIsEditingRating}
            ratingCriteria={ratingCriteria}
            setRatingCriteria={setRatingCriteria}
            ratingComment={ratingComment}
            setRatingComment={setRatingComment}
            RATING_CRITERIA={RATING_CRITERIA}
            rateTeacher={rateTeacher}
            privateEvaluations={privateEvaluations}
          />

        ) : currentHash === 'profile' ? (
          /* ═══ HỒ SƠ HỌC VIÊN ═══ */
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {/* Header card */}
            <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full"></div>
              <div className="absolute -right-5 -bottom-5 w-24 h-24 bg-white/5 rounded-full"></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                <div className="relative group">
                  <div className="w-28 h-28 md:w-32 md:h-32 rounded-2xl overflow-hidden border-4 border-white/30 shadow-2xl">
                    {studentData.avatar ? (
                      <img src={studentData.avatar} alt={studentData.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-teal-500 flex items-center justify-center text-white text-3xl font-black">
                        {studentData.name.split(' ').map(w => w[0]).slice(-2).join('')}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-400 rounded-full border-3 border-white flex items-center justify-center">
                    <CheckCircle size={14} className="text-white" />
                  </div>
                </div>
                <div className="text-center md:text-left flex-1">
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">{studentData.name}</h2>
                  <p className="text-teal-200 text-sm mt-1">Học viên tại Thắng Tin Học</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
                    <span className="bg-white/20 text-[10px] font-bold px-3 py-1 rounded-full">{studentData.course}</span>
                  </div>
                </div>
                <div className="flex gap-4 md:gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-black">{progressPct}%</p>
                    <p className="text-[10px] text-teal-200">Tiến độ</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black">{studentData.avgGrade}</p>
                    <p className="text-[10px] text-teal-200">Điểm TB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bài tập cần làm (To-do) */}
            {myAssignments && myAssignments.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white flex items-center justify-between">
                  <h3 className="font-bold text-orange-800 flex items-center gap-2">
                    <ClipboardList size={18} className="text-orange-500" /> Bài tập cần làm (To-do)
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-3 py-1.5 rounded-lg">
                    {myAssignments.filter(a => !a.mySubmission || a.mySubmission.status !== 'graded').length} BÀI
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 gap-4">
                    {myAssignments.map(a => {
                      const isSubmitted = a.mySubmission && a.mySubmission.status !== 'not_submitted';
                      const isGraded = a.mySubmission?.status === 'graded';
                      const deadline = new Date(a.deadline);
                      const isLate = Date.now() > deadline.getTime();

                      const daysRemaining = Math.max(0, Math.floor((deadline - Date.now()) / (1000 * 60 * 60 * 24)));
                      const hoursRemaining = Math.max(0, Math.floor(((deadline - Date.now()) / (1000 * 60 * 60)) % 24));

                      return (
                        <div key={a._id} className="border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              {a.title}
                              {isGraded ? (
                                <span className="bg-green-100 text-green-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">Đã chấm: {a.mySubmission.grade}/10</span>
                              ) : isSubmitted ? (
                                <span className="bg-blue-100 text-blue-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">Đã nộp</span>
                              ) : isLate ? (
                                <span className="bg-red-100 text-red-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">Quá hạn</span>
                              ) : (
                                <span className="bg-orange-100 text-orange-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">Chưa nộp</span>
                              )}
                            </h4>
                            <p className="text-sm text-slate-500 mt-1">{a.description}</p>
                            {!isSubmitted && !isLate && (
                              <p className="text-xs text-orange-500 font-semibold flex items-center gap-1 mt-2">
                                <Clock size={12} /> Hạn nộp: Còn {daysRemaining} ngày {hoursRemaining} giờ (tới {deadline.toLocaleDateString()})
                              </p>
                            )}
                            {a.mySubmission?.teacherFeedback && (
                              <div className="mt-3 p-3 bg-green-50/50 rounded-xl border border-green-100">
                                <p className="text-xs text-green-700"><span className="font-bold">Nhận xét:</span> {a.mySubmission.teacherFeedback}</p>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                            {a.attachedFileUrl && (
                              <a href={a.attachedFileUrl} target="_blank" rel="noreferrer" className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors">
                                <Download size={14} /> Tải đề bài
                              </a>
                            )}
                            {!isGraded && (
                              <button 
                                onClick={() => setActiveAssignment(a)}
                                className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 font-bold rounded-xl text-xs transition-colors shadow-sm ${
                                  isSubmitted ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}>
                                <FileUp size={14} /> {isSubmitted ? 'Nộp lại bài' : 'Nộp bài ngay'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Thông tin cá nhân */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden group">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white flex items-center justify-between">
                  <h3 className="font-bold text-teal-800 flex items-center gap-2">
                    <User size={18} className="text-teal-500" /> Thông tin cá nhân
                  </h3>
                  <button 
                    onClick={() => setShowUpdateProfileModal(true)}
                    className="text-[10px] font-black uppercase tracking-widest text-teal-700 bg-teal-100/50 hover:bg-teal-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Settings size={12} /> Cập nhật
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { icon: '📧', label: 'Email', value: studentData.email || 'Chưa cập nhật' },
                    { icon: '📱', label: 'Số điện thoại', value: studentData.phone || studentData.zalo || 'Chưa cập nhật' },
                    { icon: '💬', label: 'Zalo', value: studentData.zalo || 'Chưa cập nhật' },
                    { icon: '📍', label: 'Địa chỉ', value: studentData.address || 'Chưa cập nhật' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-lg">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-gray-400 uppercase font-bold">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thông tin học tập tóm tắt */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                  <h3 className="font-bold text-blue-800 flex items-center gap-2">
                    <BookOpen size={18} className="text-blue-500" /> Tóm tắt học tập
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { icon: '👨‍🏫', label: 'Giáo viên', value: studentData.teacher },
                    { icon: '📊', label: 'Trạng thái', value: studentData.status },
                    { icon: '💰', label: 'Học phí', value: studentData.price?.toLocaleString('vi-VN') + 'đ' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-lg">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-gray-400 uppercase font-bold">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.value}</p>
                      </div>
                    </div>
                  ))}

                  {/* Trạng thái thanh toán + nút đóng học phí */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{studentData.paid ? '✅' : '⏳'}</span>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Thanh toán</p>
                        <p className={`text-sm font-bold ${studentData.paid ? 'text-emerald-600' : 'text-red-500'}`}>
                          {studentData.paid ? 'Đã đóng học phí' : 'Chưa đóng'}
                        </p>
                      </div>
                    </div>
                    {!studentData.paid && (
                      <button
                        onClick={() => setShowTuitionModal(true)}
                        className="text-xs font-bold px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm shadow-blue-100"
                      >
                        Đóng ngay
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Lịch sử khóa học chi tiết */}
            {studentData.courses && studentData.courses.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2">
                    <BookOpen size={18} className="text-blue-500" /> Danh sách khóa học
                  </h3>
                  <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-black">
                    {studentData.courses.length} KHÓA
                  </span>
                </div>
                <div className="p-6 space-y-4">
                  {studentData.courses.map(c => {
                    const isCompleted = c.status === 'completed';
                    const pct = Math.round((c.completedSessions / c.totalSessions) * 100);

                    return (
                      <div key={c.id} className={`border-2 rounded-2xl p-5 transition-all ${
                        isCompleted ? 'border-green-100 bg-green-50/20' : 'border-blue-100 bg-blue-50/10'
                      }`}>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-black text-slate-800 uppercase tracking-tight">{c.name}</h4>
                            <p className="text-[10px] text-slate-400 font-bold">GV: {c.teacherName} • {new Date(c.registeredAt).toLocaleDateString('vi-VN')}</p>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ${
                            isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isCompleted ? 'Đã xong' : 'Đang học'}
                          </span>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex-1">
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between mt-1">
                              <p className="text-[9px] font-bold text-slate-400">{c.completedSessions}/{c.totalSessions} buổi</p>
                              <p className="text-[9px] font-bold text-slate-400">{pct}%</p>
                            </div>
                          </div>
                          <div className="text-right">
                             <p className="text-lg font-black text-slate-800">{c.avgGrade}</p>
                             <p className="text-[8px] font-bold text-slate-400 uppercase">Điểm TB</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tiến trình tổng thể */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-700 flex items-center gap-2">
                    <TrendingUp size={18} className="text-emerald-500" /> Tiến trình tổng thể
                  </h3>
                </div>
                <div className="p-6">
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black text-slate-600 uppercase">Hoàn thành chương trình</span>
                      <span className="text-sm font-black text-emerald-600">{progressPct}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000"
                        style={{ width: `${progressPct}%` }}></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Buổi đã học', value: studentData.completedSessions, color: 'text-blue-600 bg-blue-50' },
                      { label: 'Buổi còn lại', value: studentData.remainingSessions, color: 'text-purple-600 bg-purple-50' },
                      { label: 'Điểm trung bình', value: studentData.avgGrade, color: 'text-orange-600 bg-orange-50' },
                      { label: 'Số bài đã nộp', value: '4/4', color: 'text-teal-600 bg-teal-50' },
                    ].map((s, idx) => (
                      <div key={idx} className={`${s.color} rounded-2xl p-4 text-center border border-white/50 shadow-sm`}>
                        <p className="text-xl font-black">{s.value}</p>
                        <p className="text-[9px] font-black uppercase mt-1 opacity-70 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
            </div>

          </div>
        ) : (
          /* ═══ TỔNG QUAN (default) ═══ */
          <>
            {/* Greeting */}
            <div className="px-4 md:px-8 pt-5 pb-2 flex justify-between items-center">
              <div>
                <h2 className="text-lg md:text-xl font-black text-slate-800">Chào mừng, {studentData.name}! 👋</h2>
                <p className="text-slate-400 text-xs md:text-sm italic">"Học hôm nay, thành công mai sau."</p>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Trung Tâm Thắng Tin Học</p>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-4 md:py-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ═══ CỘT CHÍNH ═══ */}
                <div className="lg:col-span-8 space-y-6">

                  {/* Banner */}
                  <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl md:rounded-3xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-red-200 text-[10px] md:text-xs font-bold uppercase mb-2 tracking-widest flex items-center gap-1">
                        <Zap size={12} /> Lớp học sắp diễn ra
                      </p>
                      <h2 className="text-xl md:text-3xl font-black mb-2 md:mb-4 uppercase tracking-tight">{studentData.course}</h2>
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm opacity-90 mb-2 md:mb-4 flex items-center gap-2">
                            <Calendar size={14} className="flex-shrink-0" />
                            <span className="truncate">
                              {studentData.nextClass} | GV: {studentData.teacher}
                              {!isNew && teacherRatingData.count > 0 && (
                                <span className="ml-2 inline-flex items-center gap-0.5 bg-yellow-400 text-red-700 px-1.5 py-0.5 rounded-lg text-[9px] font-black shadow-sm">
                                  <Star size={10} className="fill-red-700" /> {teacherRatingData.avg}
                                </span>
                              )}
                            </span>
                          </p>
                          <p className="text-xs font-bold bg-white/20 inline-block px-3 py-1 rounded-full uppercase">Sắp diễn ra</p>
                        </div>
                        <a href={studentData.online_meeting_url || studentData.linkHoc || '#'} target="_blank" rel="noreferrer"
                          className={`w-full md:w-auto ${studentData.online_meeting_url ? 'bg-indigo-600 text-white animate-pulse shadow-indigo-500/50 hover:bg-indigo-700' : 'bg-white text-red-600'} px-8 py-4 rounded-xl md:rounded-2xl font-black text-center shadow-lg active:scale-95 transition transform hover:scale-105 flex items-center justify-center gap-3`}>
                          <Video size={22} /> {studentData.online_meeting_url ? '🔴 THAM GIA LỚP TRỰC TUYẾN' : 'VÀO LỚP NGAY'}
                        </a>
                      </div>
                    </div>
                    <PlayCircle size={200} className="absolute -right-10 -bottom-10 text-white opacity-10 hidden md:block" />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon={BookOpen} label="Đã học" value={studentData.completedSessions} sub={`/ ${studentData.totalSessions}`} color="from-blue-500 to-blue-600" />
                    <StatCard icon={Clock} label="Còn lại" value={studentData.remainingSessions} sub="buổi" color="from-[#1E3A8A] to-[#203DB5]" />
                    <StatCard icon={Star} label="Điểm TB" value={studentData.avgGrade} sub="/ 10" color="from-orange-400 to-orange-500" />
                    <StatCard icon={TrendingUp} label="Tiến độ" value={`${progressPct}%`} sub="hoàn thành" color="from-emerald-400 to-emerald-500" />
                  </div>

                  {/* QUICK ACTIONS / Việc cần làm */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 cursor-pointer mb-6 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full pointer-events-none" />
                     <div className="flex items-center gap-2 mb-5 relative z-10">
                        <Zap size={20} className="text-yellow-500 fill-yellow-500" />
                        <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">Việc cần làm hôm nay</h3>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
                         <div className="bg-orange-50/50 hover:bg-orange-50 border border-orange-100 p-4 rounded-2xl flex flex-col gap-3 transition-colors group/card" onClick={() => navigate('/student#materials')}>
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-600 shadow-sm border border-orange-100/50 group-hover/card:scale-110 transition-transform">
                              <ClipboardList size={20} />
                            </div>
                            <div>
                               <h4 className="font-bold text-slate-800 text-sm">Bài tập về nhà</h4>
                               <p className="text-orange-600 text-xs font-semibold mt-1">
                                 {myAssignments ? myAssignments.filter(a => !a.mySubmission || a.mySubmission.status !== 'graded').length : 0} bài cần nộp
                               </p>
                            </div>
                         </div>
                         
                         <div className="bg-blue-50/50 hover:bg-blue-50 border border-blue-100 p-4 rounded-2xl flex flex-col gap-3 transition-colors group/card" onClick={() => navigate('/student#schedule')}>
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100/50 group-hover/card:scale-110 transition-transform">
                              <Calendar size={20} />
                            </div>
                            <div>
                               <h4 className="font-bold text-slate-800 text-sm">Lịch học sắp tới</h4>
                               <p className="text-blue-600 text-xs font-semibold mt-1">Kiểm tra lịch</p>
                            </div>
                         </div>

                         <div className="bg-purple-50/50 hover:bg-purple-50 border border-purple-100 p-4 rounded-2xl flex flex-col gap-3 transition-colors group/card" onClick={() => navigate('/inbox')}>
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100/50 group-hover/card:scale-110 transition-transform">
                              <MessageSquare size={20} />
                            </div>
                            <div>
                               <h4 className="font-bold text-slate-800 text-sm">Tin nhắn & Phản hồi</h4>
                               <p className="text-purple-600 text-xs font-semibold mt-1">{myNotifs} thông báo mới</p>
                            </div>
                         </div>
                     </div>
                  </div>

                  {/* Nhật ký */}
                  <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm md:text-base">
                        <Clock size={16} className="text-blue-500" /> NHẬT KÝ HỌC TẬP
                      </h3>
                      <span className="text-[10px] md:text-xs text-gray-400">{studentData.attendanceHistory.length} buổi</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {studentData.attendanceHistory.map((item, idx) => (
                        <div key={idx} className="px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50 transition-colors gap-2 md:gap-4">
                          <div className="flex items-start md:items-center gap-3">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center bg-green-100 text-green-600 flex-shrink-0 mt-0.5 md:mt-0">
                              <CheckCircle size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-800 truncate">
                                Buổi {studentData.attendanceHistory.length - idx} — {item.date}
                              </p>
                              <p className="text-[10px] md:text-xs text-slate-400 italic truncate">{item.note}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 md:text-right flex-shrink-0 ml-12 md:ml-0">
                            <span className={`text-lg font-black ${item.grade >= 8 ? 'text-green-600' : item.grade >= 6 ? 'text-orange-500' : 'text-red-500'}`}>
                              {item.grade}
                            </span>
                            <span className="text-[10px] text-gray-400">/ 10</span>
                            <span className={`text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${
                              item.grade >= 8 ? 'bg-green-100 text-green-700' : item.grade >= 6 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {item.grade >= 8 ? 'GIỎI' : item.grade >= 6 ? 'KHÁ' : 'TB'}
                            </span>
                          </div>
                        </div>
                      ))}
                      {studentData.attendanceHistory.length === 0 && (
                        <div className="px-6 py-12 text-center text-gray-400 text-sm">Chưa có buổi học nào được ghi nhận.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ═══ CỘT PHỤ ═══ */}
                <div className="lg:col-span-4 space-y-6">

                  {/* Tiến độ */}
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">Tiến độ</p>
                      <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke="url(#grad)" strokeWidth="8"
                            strokeLinecap="round" strokeDasharray={`${progressPct * 2.64} 264`} className="transition-all duration-1000" />
                          <defs>
                            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" style={{ stopColor: '#ef4444' }} />
                              <stop offset="100%" style={{ stopColor: '#f97316' }} />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div>
                            <p className="text-lg md:text-2xl font-black text-gray-800">{progressPct}%</p>
                            <p className="text-[8px] md:text-[10px] text-gray-400">hoàn thành</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 md:mt-4 flex justify-between text-[10px] md:text-xs text-gray-500">
                        <span>Đã: <strong className="text-gray-800">{studentData.completedSessions}</strong></span>
                        <span>Còn: <strong className="text-gray-800">{studentData.remainingSessions}</strong></span>
                      </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 text-center flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Điểm TB</p>
                      <p className="text-4xl md:text-5xl font-black text-blue-600">{studentData.avgGrade}</p>
                      <p className="text-[10px] text-gray-400 mt-1">/ 10 điểm</p>
                      <div className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full mx-auto ${
                        studentData.avgGrade >= 8 ? 'bg-green-100 text-green-700' : studentData.avgGrade >= 6 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {studentData.avgGrade >= 8 ? 'GIỎI' : studentData.avgGrade >= 6 ? 'KHÁ' : 'TRUNG BÌNH'}
                      </div>
                    </div>
                  </div>



                  {/* Tài liệu nhanh */}
                  <div className="bg-slate-800 p-5 md:p-6 rounded-2xl text-white">
                    <h3 className="font-bold text-[11px] md:text-sm mb-3 md:mb-4 uppercase text-slate-400 flex items-center gap-2">
                      <Download size={14} /> Tài liệu
                    </h3>
                    <div className="space-y-2">
                      {materials.filter(m => m.category === 'document').slice(0, 3).map(m => (
                        <div key={m.id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl hover:bg-slate-700 transition cursor-pointer">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 ${
                              m.type === 'PDF' ? 'bg-red-500' : m.type === 'XLSX' ? 'bg-green-500' : 'bg-orange-500'
                            }`}>{m.type}</span>
                            <span className="text-[11px] md:text-xs truncate">{m.name}</span>
                          </div>
                          <Download size={14} className="text-blue-400 flex-shrink-0 ml-2" />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => navigate('/student#materials')}
                      className="w-full mt-3 text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition">
                      Xem tất cả <ChevronRight size={12} />
                    </button>
                  </div>

                  {/* Contact */}
                  <div className="hidden lg:block space-y-3">
                    <button 
                      onClick={() => navigate('/student/inbox', { state: { selectUserId: studentData.teacherId } })}
                      className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition group shadow-sm">
                      <MessageSquare className="group-hover:animate-bounce" size={18} /> Nhắn tin Giảng viên
                    </button>
                    <a href="tel:0935758462"
                      className="w-full flex items-center justify-center gap-3 bg-red-50 border-2 border-red-100 p-4 rounded-2xl font-bold text-red-600 hover:bg-red-100 transition shadow-sm text-sm">
                      <Phone size={16} /> Gọi Hotline hỗ trợ
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* FAB - Thay thay thế Zalo bằng liên kết nội bộ tới Hộp Thư */}
      <button 
        onClick={() => navigate('/student/inbox', { state: { selectUserId: studentData.teacherId } })}
        className="lg:hidden fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl z-50 active:scale-90 transition">
        <MessageSquare size={24} />
      </button>

      {activeMilestone && (
        <MilestoneEvaluationModal
          milestone={activeMilestone}
          studentId={STUDENT_ID}
          teacherId={studentData.teacherId}
          courseName={studentData.course}
          onClose={() => setActiveMilestone(null)}
          onSubmit={submitPrivateEvaluation}
        />
      )}
    </div>
  );
};

export default StudentDashboard;
