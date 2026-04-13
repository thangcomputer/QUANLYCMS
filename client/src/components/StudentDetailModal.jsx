import React, { useState, useEffect } from 'react';
import {
  X, User, BookOpen, Clock, DollarSign, Trophy, 
  MapPin, Phone, MessageSquare, Calendar, ChevronRight,
  TrendingUp, CreditCard, ClipboardList, ShieldCheck, 
  Printer, Loader2, AlertCircle, CheckCircle2, Star,
  Smartphone, Hash, ArrowUpRight, Building2, Plus, Download
} from 'lucide-react';
import api from '../services/api';
import { useModal } from '../utils/Modal.jsx';

const fmt = (n) => n ? Number(n).toLocaleString('vi-VN') + 'đ' : '0đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

export default function StudentDetailModal({ studentId, onClose }) {
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState(null);
  const { showModal }             = useModal();
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'attendance' | 'finance' | 'academic'

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api.students.getFullDetail(studentId)
      .then(res => {
        if (res.success) {
          setData(res.data);
          // Auto fetch assignments for the course
          if (res.data.student?.course) {
            fetchAssignments(res.data.student.course);
          }
        }
      })
      .catch(err => void 0)
      .finally(() => setLoading(false));
  }, [studentId]);

  const [assignments, setAssignments] = useState([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [newAssign, setNewAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });

  const fetchAssignments = async (course) => {
    setLoadingAssign(true);
    try {
      const res = await api.assignments.getForStudent(studentId, course);
      if (res.success) setAssignments(res.data);
    } catch (err) { void 0 }
    finally { setLoadingAssign(false); }
  };

  const handleAddAssignment = async () => {
    if (!newAssign.title || !newAssign.deadline) return;
    try {
      const res = await api.assignments.create({
        ...newAssign,
        courseId: data.student.course,
        teacherId: data.student.teacherId?._id || 'admin', // default to admin or current teacher
      });
      if (res.success) {
        setShowAddAssign(false);
        setNewAssign({ title: '', deadline: '', fileUrl: '', description: '' });
        fetchAssignments(data.student.course);
      }
    } catch (err) { void 0 }
  };

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* Modal Container */}
      <div className="bg-[#f8fafc] w-full max-w-5xl h-[90vh] rounded-[40px] shadow-2xl relative z-10 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 border border-white/20">
        
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg transform rotate-45 animate-pulse" />
              </div>
            </div>
            <p className="text-sm font-black text-indigo-900/40 uppercase tracking-widest">Đang tải hồ sơ...</p>
          </div>
        ) : !data ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-500 gap-2">
            <AlertCircle size={40} />
            <p className="font-bold">Lỗi tải dữ liệu. Vui lòng thử lại sau.</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-slate-200 rounded-full font-bold text-slate-700">Đóng</button>
          </div>
        ) : (
          <>
            {/* ── HEADER AREA ────────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-100 p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
               {/* Background Glow */}
               <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-50 rounded-full blur-3xl opacity-50" />
               <div className="absolute top-10 right-10 flex gap-2">
                  <button onClick={onClose} className="w-10 h-10 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-2xl flex items-center justify-center transition-all">
                    <X size={20} />
                  </button>
               </div>

               {/* Avatar & Basic Info */}
               <div className="relative group">
                 <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-xl shadow-indigo-100 border-4 border-white transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 overflow-hidden">
                    {data.student?.avatar ? (
                      <img src={data.student.avatar} className="w-full h-full object-cover" alt="avatar" />
                    ) : (
                      <span className="text-4xl font-black">{data.student.name?.charAt(0)}</span>
                    )}
                 </div>
                 <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-xl border-4 border-white shadow-lg">
                    <ShieldCheck size={14} />
                 </div>
               </div>

               <div className="flex-1 text-center md:text-left space-y-2">
                 <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                   <h2 className="text-3xl font-black text-slate-900 tracking-tight">{data.student.name}</h2>
                   <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                     data.student.paid ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                   }`}>
                     {data.student.paid ? 'Đã thanh toán' : 'Chưa đóng phí'}
                   </span>
                   <span className="px-4 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-wider border border-indigo-100">
                     {data.student.course}
                   </span>
                 </div>
                 
                 <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-slate-400 text-sm font-semibold">
                   <div className="flex items-center gap-1.5">
                     <Smartphone size={14} className="text-slate-300" />
                     <span>{data.student.phone || data.student.zalo}</span>
                   </div>
                   <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                   <div className="flex items-center gap-1.5">
                     <Building2 size={14} className="text-slate-300" />
                     <span>Chi nhánh: {data.student.branchCode || 'Hệ thống'}</span>
                   </div>
                   <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                   <div className="flex items-center gap-1.5">
                     <Calendar size={14} className="text-slate-300" />
                     <span>Đăng ký: {fmtDate(data.student.createdAt)}</span>
                   </div>
                 </div>
               </div>
            </div>

            {/* ── TABS NAVIGATION ───────────────────────────────────────────── */}
            <div className="flex px-8 bg-white border-b border-slate-100 gap-6">
               {[
                 { id: 'summary', label: 'TỔNG QUAN', icon: ClipboardList },
                 { id: 'attendance', label: 'LỊCH HỌC', icon: Clock },
                 { id: 'assignments', label: 'BÀI TẬP', icon: BookOpen },
                 { id: 'finance', label: 'TÀI CHÍNH', icon: CreditCard },
                 { id: 'academic', label: 'ĐIỂM SỐ', icon: Trophy },
               ].map(tab => (
                 <button 
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id)}
                   className={`flex items-center gap-2 py-5 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                     activeTab === tab.id 
                       ? 'text-indigo-600' 
                       : 'text-slate-400 hover:text-slate-600'
                   }`}
                 >
                   <tab.icon size={14} />
                   {tab.label}
                   {activeTab === tab.id && (
                     <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full animate-in slide-in-from-bottom-1" />
                   )}
                 </button>
               ))}
            </div>

            {/* ── MAIN CONTENT AREA ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-8">
              
              {/* --- TAB 1: SUMMARY --- */}
              {activeTab === 'summary' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatBox 
                      label="Tiến độ học tập" 
                      value={`${data.student.progressPercent || 0}%`} 
                      icon={TrendingUp} 
                      color="bg-indigo-600" 
                      sub={`${data.student.completedSessions || 0}/${data.student.totalSessions || 12} buổi`}
                    />
                    <StatBox 
                      label="Số buổi còn lại" 
                      value={data.student.remainingSessions || 0} 
                      icon={Clock} 
                      color="bg-amber-500" 
                    />
                    <StatBox 
                      label="Học phí gốc" 
                      value={fmt(data.student.price)} 
                      icon={DollarSign} 
                      color="bg-emerald-600" 
                    />
                    <StatBox 
                      label="Điểm trung bình" 
                      value={data.student.avgGrade || '—'} 
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
                               <p className="text-xl font-black text-indigo-600">{data.student.progressPercent || 0}%</p>
                             </div>
                             <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
                                <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-1000 ease-out shadow-lg" 
                                  style={{ width: `${data.student.progressPercent || 0}%` }}
                                />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 pt-4">
                             <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                <p className="text-[10px] font-black text-indigo-900/40 uppercase mb-1">Giảng viên phụ trách</p>
                                <p className="text-sm font-black text-indigo-900">{data.student.teacherId?.name || 'Chưa gán'}</p>
                             </div>
                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Trạng thái hiện tại</p>
                                <p className="text-sm font-black text-slate-700">{data.student.status}</p>
                             </div>
                          </div>
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
                  <div className="bg-white rounded-3xl overflow-hidden border border-slate-100">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-6 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Ngày học</th>
                          <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Giảng viên</th>
                          <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Nội dung / Ghi chú</th>
                          <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.schedules.map(sch => (
                          <tr key={sch._id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4 text-xs font-bold text-slate-700">{fmtDate(sch.date)}</td>
                            <td className="px-4 py-4 text-xs font-semibold text-slate-600">{sch.teacherName || '—'}</td>
                            <td className="px-4 py-4 text-xs text-slate-400">{sch.note || sch.subject || 'Dạy thực tế'}</td>
                            <td className="px-4 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                                sch.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                              }`}>
                                {sch.status === 'completed' ? 'Đã học' : 'Sắp tới'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {data.schedules.length === 0 && (
                          <tr><td colSpan={4} className="py-20 text-center text-slate-300 italic text-sm">Chưa có dữ liệu điểm danh</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* --- TAB 3: FINANCE --- */}
              {activeTab === 'finance' && (
                <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-emerald-600 rounded-3xl p-8 text-white relative overflow-hidden flex flex-col justify-between h-48">
                        <DollarSign className="absolute -right-8 -bottom-8 w-40 h-40 opacity-10" />
                        <div>
                          <p className="text-[11px] font-black opacity-60 uppercase tracking-widest mb-1">Trạng thái đóng phí</p>
                          <h4 className="text-3xl font-black">{data.student.paid ? 'ĐÃ HOÀN TẤT' : 'CÒN NỢ'}</h4>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] font-bold opacity-60">Đăng ký ngày</p>
                            <p className="text-sm font-black">{fmtDate(data.student.createdAt)}</p>
                          </div>
                          {!data.student.paid && (
                            <button onClick={() => showModal({ 
                                title: 'Hướng dẫn nghiệp vụ', 
                                content: 'Chức năng "Thu Học Phí" vui lòng thực hiện tại tab "Giao dịch" để đảm bảo tính đồng nhất của dữ liệu kế toán!', 
                                type: 'info' 
                            })} className="bg-white text-emerald-600 px-6 py-2 rounded-xl font-black text-[11px] uppercase tracking-wider hover:bg-emerald-50 transition-all">
                              Thu học phí ngay
                            </button>
                          )}
                        </div>
                     </div>
                     <div className="bg-white rounded-3xl p-8 border border-slate-100 flex flex-col justify-between h-48 shadow-sm">
                        <div>
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Số tiền thanh toán</p>
                          <h4 className="text-3xl font-black text-slate-800">{fmt(data.student.price)}</h4>
                        </div>
                        <div className="flex gap-4">
                           <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Hình thức</p>
                              <p className="text-xs font-black text-slate-700 capitalize">
                                {data.student.paymentMethod === 'cash' ? 'Tiền mặt' : (data.student.paymentMethod === 'transfer' ? 'Chuyển khoản' : (data.student.paymentMethod || 'Chuyển khoản'))}
                              </p>
                           </div>
                           <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Cơ sở</p>
                              <p className="text-xs font-black text-slate-700">{data.student.branchCode || 'Hệ thống'}</p>
                           </div>
                        </div>
                     </div>
                  </div>

                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider pt-4">Lịch sử hóa đơn</h3>
                  <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-6 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Mã Hóa đơn</th>
                          <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Ngày tạo</th>
                          <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Nội dung</th>
                          <th className="px-4 py-4 text-right text-[11px] font-black text-slate-400 tracking-widest uppercase">Số tiền</th>
                          <th className="px-6 py-4 text-center text-[11px] font-black text-slate-400 tracking-widest uppercase">In</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.invoices.map(inv => (
                          <tr key={inv._id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-indigo-600">{inv.maHoaDon}</span>
                            </td>
                            <td className="px-4 py-4 text-xs font-semibold text-slate-600">{fmtDate(inv.createdAt)}</td>
                            <td className="px-4 py-4 text-xs text-slate-400">{inv.khoaHoc} — {inv.ghiChu || 'Thu phí ghi danh'}</td>
                            <td className="px-4 py-4 text-right font-black text-slate-800 text-sm">{fmt(inv.hocPhi)}</td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => window.print()} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 inline-flex items-center justify-center transition-all">
                                <Printer size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {data.invoices.length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-300 italic text-sm">Chưa phát sinh hóa đơn nào</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
                {/* --- TAB: ASSIGNMENTS --- */}
                {activeTab === 'assignments' && (
                  <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                        <BookOpen size={16} className="text-blue-500" /> Danh sách bài tập được giao
                      </h3>
                      <button 
                        onClick={() => setShowAddAssign(!showAddAssign)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5"
                      >
                        <Plus size={14} /> GIAO BÀI TẬP MỚI
                      </button>
                    </div>

                    {showAddAssign && (
                      <div className="bg-white rounded-3xl p-6 border-2 border-indigo-100 shadow-xl space-y-4 animate-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-indigo-50 pb-3">
                           <p className="text-xs font-black text-indigo-700 uppercase tracking-widest">Thiết lập bài tập ({data?.student?.course})</p>
                           <button onClick={() => setShowAddAssign(false)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          onClick={handleAddAssignment}
                          className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                        >
                          XÁC NHẬN GIAO BÀI
                        </button>
                      </div>
                    )}

                    <div className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-sm">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-6 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Bài tập</th>
                            <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase">Thời hạn</th>
                            <th className="px-4 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Tiến độ</th>
                            <th className="px-6 py-4 text-[11px] font-black text-slate-400 tracking-widest uppercase text-center">Kết quả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {loadingAssign ? (
                            <tr><td colSpan={4} className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-400" /></td></tr>
                          ) : assignments.length === 0 ? (
                            <tr><td colSpan={4} className="py-20 text-center text-slate-300 italic text-sm">Chưa có bài tập nào được giao</td></tr>
                          ) : assignments.map(a => {
                            const sub = a.mySubmission;
                            const isLate = new Date() > new Date(a.deadline) && !sub;
                            return (
                              <tr key={a._id} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-0.5">{a.title}</p>
                                  <p className="text-[10px] text-slate-400 font-bold truncate max-w-[200px]">{a.description || 'Không có mô tả'}</p>
                                  {a.attachedFileUrl && (
                                    <a href={a.attachedFileUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 font-bold flex items-center gap-1 mt-1 hover:underline">
                                      <Download size={10} /> Tải đề bài
                                    </a>
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
                                    {sub ? '✅ ĐÃ NỘP' : isLate ? '❌ TRỄ HẠN' : '⏳ CHƯA DÀNH'}
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
                  </div>
                )}

              {/* --- TAB 4: ACADEMIC --- */}
              {activeTab === 'academic' && (
                <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Kết quả thi cử */}
                    <div className="space-y-4">
                       <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                         <Trophy size={16} className="text-amber-500" /> Kết quả thi tốt nghiệp
                       </h3>
                       <div className="space-y-4">
                          {data.examResults.length === 0 ? (
                            <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 border-dashed text-center">
                               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">Học viên chưa tham gia kỳ thi nào</p>
                            </div>
                          ) : (
                            data.examResults.map(res => (
                              <div key={res._id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center justify-between">
                                 <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                                       <Hash size={24} />
                                    </div>
                                    <div>
                                       <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">{fmtDate(res.createdAt)}</p>
                                       <p className="text-sm font-black text-slate-800">Môn: {res.subject || 'Tổng hợp'}</p>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-3xl font-black text-indigo-600">{res.score}</p>
                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Đạt tiêu chuẩn</span>
                                 </div>
                              </div>
                            ))
                          )}
                       </div>
                    </div>

                    {/* Đánh giá bài tập hàng ngày */}
                    <div className="space-y-4">
                       <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                         <ClipboardList size={16} className="text-indigo-500" /> Tiến độ bài tập
                       </h3>
                       <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                          {(!data.student.grades || data.student.grades.length === 0) ? (
                            <p className="text-xs text-slate-400 italic py-4 text-center">Chưa có đánh giá bài tập</p>
                          ) : (
                            data.student.grades.map((g, i) => (
                              <div key={i} className="flex gap-4">
                                 <div className="flex flex-col items-center">
                                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-xs font-black text-slate-400">
                                       {g.grade}
                                    </div>
                                    {i < data.student.grades.length - 1 && <div className="w-px h-full bg-slate-100 my-1" />}
                                 </div>
                                 <div className="flex-1 pb-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{g.date || 'Giai đoạn học'}</p>
                                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">{g.note}</p>
                                 </div>
                              </div>
                            ))
                          )}
                       </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* ── FOOTER ACTIONS ───────────────────────────────────────────── */}
            <div className="bg-slate-50 border-t border-slate-100 p-6 flex items-center justify-between">
               <div className="flex gap-2">
                 <button onClick={() => window.open(`http://zalo.me/${data.student.zalo || data.student.phone}`, '_blank')} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
                   <MessageSquare size={14} className="text-indigo-500" /> NHẮN TIN
                 </button>
                 <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
                   <Printer size={14} className="text-slate-400" /> IN TẤT CẢ
                 </button>
               </div>
               
               <div className="flex items-center gap-4">
                  {!data.student.paid && (
                     <p className="text-xs font-bold text-red-500 flex items-center gap-1.5 animate-pulse">
                        <AlertCircle size={14} /> Còn nợ: {fmt(data.student.price)}
                     </p>
                  )}
                  <button 
                    onClick={onClose}
                    className="px-8 py-3 bg-slate-900 text-white rounded-[20px] text-xs font-black hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 hover:shadow-indigo-200 flex items-center gap-2 group"
                  >
                    HOÀN TẤT XEM
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

{/* Helper UI Components */}
function StatBox({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-500">
       <div className={`absolute top-0 left-0 w-1.5 h-full ${color}`} />
       <div className="flex items-start justify-between">
          <div className="space-y-1">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
             <h4 className="text-2xl font-black text-slate-800">{value}</h4>
             {sub && <p className="text-[10px] text-slate-400 font-bold">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:rotate-12 transition-transform`}>
             <Icon size={18} />
          </div>
       </div>
    </div>
  );
}
