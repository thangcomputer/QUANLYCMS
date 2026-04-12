import React, { useState } from 'react';
import {
  DollarSign, PlayCircle, Download, Calendar as CalendarIcon,
  Clock, TrendingUp, CreditCard,
  CheckCircle2, FileText, Video,
  BookOpen, AlertCircle, BarChart, FileSpreadsheet, FileBox
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useData } from '../context/DataContext';
import { useLocation } from 'react-router-dom';
import { useModal } from '../utils/Modal.jsx';
import api, { getRolePrefix } from '../services/api';

// MOCK_PAYMENTS removed - using real data from context

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const TeacherFinanceAndTraining = () => {
  const { trainingData } = useData();
  const { showModal } = useModal();
  const location = useLocation();
  const currentHash = location.hash?.replace('#', '') || '';
  const isTraining = currentHash === 'training';
  const prefix = getRolePrefix ? getRolePrefix() : (localStorage.getItem('teacher_user') ? 'teacher' : 'admin');
  const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || '{}');
  const teacherId = session.id || session._id;
  const teacherName = session.name || 'Giảng viên';

  const [myPayments, setMyPayments] = useState([]);
  const [financeStats, setFinanceStats] = useState({
    totalSessions: 0, unpaidAmount: 0, paidAmount: 0, salaryPerSession: 0
  });
  const [isLoadingFinance, setIsLoadingFinance] = useState(false);
  const [myTrainingData, setMyTrainingData] = useState({ videos: [], guides: [], files: [] });

  React.useEffect(() => {
    if (!isTraining) {
      setIsLoadingFinance(true);
      Promise.all([
        api.transactions.getByTeacher(teacherId).catch(() => ({ success: false })),
        api.teachers.getFinance(teacherId).catch(() => ({ success: false }))
      ]).then(([txRes, finRes]) => {
        if (txRes && txRes.success) setMyPayments(txRes.data || []);
        if (finRes && finRes.success) setFinanceStats(finRes.data || { totalSessions: 0, unpaidAmount: 0, paidAmount: 0, salaryPerSession: 0 });
      }).finally(() => setIsLoadingFinance(false));
    } else {
      // NOTE: Tính năng Đào tạo chưa có API Backend. Dùng dữ liệu trống tạm thời.
      Promise.resolve({ success: true, data: [] }).then(res => {
         if (res.success) {
            const data = res.data || [];
            setMyTrainingData({
               videos: data.filter(d => d.type === 'video'),
               guides: data.filter(d => d.type === 'guide' || d.type === 'document' || d.type === 'text'),
               files: data.filter(d => d.type === 'file')
            });
         }
      }).catch(console.error);
    }
  }, [isTraining, teacherId]);

  const totalEarned = financeStats.paidAmount || 0;
  const totalPending = financeStats.unpaidAmount || 0;
  const totalSessions = financeStats.totalSessions || 0;
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredPayments = filterStatus === 'all'
    ? myPayments
    : myPayments.filter(p => {
        if (filterStatus === 'paid') return p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed';
        return p.status === filterStatus;
      });

  const videos = myTrainingData.videos;
  const guides = myTrainingData.guides;
  const files = myTrainingData.files;

  // Prepare chart data
  const chartData = React.useMemo(() => {
    const dataObj = {};
    myPayments.filter(p => p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed').forEach(p => {
        const key = p.month || 'Không rõ';
        dataObj[key] = (dataObj[key] || 0) + (p.amount || 0);
    });
    // Create array and sort implicitly if needed
    const arr = Object.entries(dataObj).map(([month, amount]) => ({ month, amount }));
    // Assuming months are like "Tháng 03/2026", "Tháng 04/2026"
    return arr.sort((a,b) => a.month.localeCompare(b.month));
  }, [myPayments]);

  const maxAmount = Math.max(...chartData.map(d => d.amount), 1); // Avoid division by zero

  const handleExportCSV = () => {
    try {
      let csvContent = "\uFEFF";
      csvContent += "Tháng,Ngày chuyển,Số tiền (VNĐ),Số buổi,Trạng thái,Ghi chú\n";
      filteredPayments.forEach(p => {
          const th_status = (p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed') ? 'Đã nhận' : 'Chưa nhận';
          const row = `"${p.month}","${p.date || new Date(p.createdAt).toLocaleDateString('vi-VN')}","${p.amount}","${p.sessions || 0}","${th_status}","${p.note || ''}"`;
          csvContent += row + "\n";
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const encodedUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = encodedUrl;
      link.download = `ThuNhap_${teacherName.replace(/\s+/g,'_')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(encodedUrl), 10000);
    } catch(e) {
      showModal({ 
          title: 'Lỗi xuất file', 
          content: 'Không thể khởi tạo file CSV: ' + e.message, 
          type: 'error' 
      });
    }
  };

  const handleExportPDF = async () => {
    const el = document.getElementById('finance-report');
    if (!el) return;
    const oldClass = el.className;
    el.className = "bg-white p-8 w-[1000px] h-max"; // Fixed width to ensure standard capturing
    
    try {
        const canvas = await html2canvas(el, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`BaoCao_ThuNhap_${teacherName.replace(/\s+/g,'_')}.pdf`);
    } catch(e) { console.error('Lỗi in PDF', e); }
    finally { el.className = oldClass; }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 md:px-8 py-6 space-y-6">

        {!isTraining ? (
          /* ════════ TÀI CHÍNH ════════ */
          <div id="finance-report">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <DollarSign size={20} className="text-green-600" /> Tài chính & Hoa hồng
              </h2>
              <p className="text-xs text-gray-400">GV: {teacherName}</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
                <p className="text-green-200 text-[10px] uppercase tracking-wider font-semibold">Tổng đã nhận</p>
                <p className="text-3xl font-black mt-1">{totalEarned.toLocaleString('vi-VN')}đ</p>
                <div className="flex items-center gap-2 mt-2">
                  <TrendingUp size={14} />
                  <span className="text-green-200 text-xs">+12% so với tháng trước</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                <p className="text-orange-200 text-[10px] uppercase tracking-wider font-semibold">Chưa nhận</p>
                <p className="text-3xl font-black mt-1">{totalPending.toLocaleString('vi-VN')}đ</p>
                <div className="flex items-center gap-2 mt-2">
                  <AlertCircle size={14} />
                  <span className="text-orange-200 text-xs">Đang chờ Admin chuyển</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
                <p className="text-blue-200 text-[10px] uppercase tracking-wider font-semibold">Tổng buổi đã dạy</p>
                <p className="text-3xl font-black mt-1">{totalSessions}</p>
                <div className="flex items-center gap-2 mt-2">
                  <CalendarIcon size={14} />
                  <span className="text-blue-200 text-xs">Tất cả các tháng</span>
                </div>
              </div>
            </div>

            {/* Báo cáo & Biểu đồ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
               <div className="lg:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-6">
                     <BarChart className="text-blue-600" size={20} />
                     <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">Biểu đồ thu nhập</h3>
                  </div>
                  <div className="h-[220px] w-full flex items-end gap-2 md:gap-4 mt-8 pb-4 border-b border-dashed border-slate-200 px-2">
                     {chartData.length > 0 ? chartData.map((d, i) => (
                         <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-2 group relative">
                             <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg pointer-events-none whitespace-nowrap">
                                 {d.amount.toLocaleString('vi-VN')}đ
                             </div>
                             <div className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-xl transition-all duration-700 ease-out hover:from-blue-500 hover:to-indigo-400 cursor-pointer shadow-lg shadow-blue-900/20" 
                                  style={{ height: `${(d.amount / maxAmount) * 100}%`, minHeight: '10%' }} />
                             <span className="text-[10px] font-bold text-slate-400 absolute -bottom-6 truncate w-full text-center">{d.month.replace('Tháng ', 'T')}</span>
                         </div>
                     )) : (
                         <div className="w-full h-full flex items-center justify-center text-sm text-slate-400 font-bold">Chưa có dữ liệu thống kê</div>
                     )}
                  </div>
               </div>

               <div className="lg:col-span-4 bg-gradient-to-br from-[#203DB5] to-[#1E3A8A] rounded-3xl p-6 shadow-xl text-white transform transition-all">
                  <h3 className="font-extrabold uppercase tracking-tight mb-2 flex items-center gap-2"><Download size={20} /> Xuất Báo Cáo</h3>
                  <p className="text-blue-100 text-xs font-semibold mb-6">Tải xuống sao kê thu nhập của bạn</p>
                  <div className="space-y-3 mt-4">
                      <button onClick={handleExportPDF} className="w-full bg-white/10 hover:bg-white/20 border border-white/20 py-4 rounded-2xl flex items-center justify-between px-5 transition-all text-sm font-bold shadow-sm">
                          <span className="flex items-center gap-3"><FileBox size={18} className="text-red-300" /> Báo cáo PDF</span>
                          <Download size={16} />
                      </button>
                      <button onClick={handleExportCSV} className="w-full bg-white/10 hover:bg-white/20 border border-white/20 py-4 rounded-2xl flex items-center justify-between px-5 transition-all text-sm font-bold shadow-sm">
                          <span className="flex items-center gap-3"><FileSpreadsheet size={18} className="text-green-300" /> Dữ liệu CSV (Excel)</span>
                          <Download size={16} />
                      </button>
                  </div>
               </div>
            </div>

            {/* Payment History */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 mt-6 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <CreditCard size={18} className="text-green-600" /> LỊCH SỬ CHUYỂN TIỀN HOA HỒNG
                </h3>
                <div className="flex gap-2">
                  {[
                    { key: 'all', label: 'Tất cả' },
                    { key: 'paid', label: 'Đã nhận' },
                    { key: 'pending', label: 'Chưa nhận' },
                  ].map(f => (
                    <button key={f.key} onClick={() => setFilterStatus(f.key)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all border ${
                        filterStatus === f.key
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {filteredPayments.map(p => (
                  <div key={p.id} className={`px-6 py-5 flex items-center justify-between hover:bg-gray-50/50 transition ${p.status === 'pending' ? 'bg-orange-50/30' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${
                        (p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed') ? 'bg-green-100' : 'bg-orange-100'
                      }`}>
                        {(p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed')
                          ? <CheckCircle2 size={20} className="text-green-600" />
                          : <Clock size={20} className="text-orange-600" />
                        }
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base">{p.amount ? p.amount.toLocaleString('vi-VN') : 0}đ</p>
                        <p className="text-xs text-gray-500 mt-0.5">{p.note || p.description}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarIcon size={10} /> {p.month} · Ngày duyệt: {p.date || new Date(p.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {(p.status === 'completed' || p.status === 'paid' || p.status === 'confirmed') ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
                          <CheckCircle2 size={12} /> Đã nhận
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full">
                          <Clock size={12} /> Đang chờ
                        </span>
                      )}
                      {p.sessions > 0 && <p className="text-[10px] text-gray-400 mt-1">{p.sessions} buổi</p>}
                    </div>
                  </div>
                ))}

                {filteredPayments.length === 0 && (
                  <div className="px-6 py-12 text-center text-gray-400">
                    <DollarSign size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Không có giao dịch nào</p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Tổng đã nhận:</span>
                  <span className="text-lg font-black text-green-700">{totalEarned.toLocaleString('vi-VN')}đ</span>
                </div>
                {totalPending > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-gray-500">Chờ nhận:</span>
                    <span className="text-lg font-black text-orange-600">{totalPending.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        ) : (
          /* ════════ ĐÀO TẠO (dữ liệu từ Admin) ════════ */
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <BookOpen size={20} className="text-purple-600" /> Đào tạo & Tài liệu
              </h2>
              <p className="text-xs text-gray-400">Nội dung do Admin quản lý · GV: {teacherName}</p>
            </div>

            {/* Video hướng dẫn */}
            {videos.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Video size={18} className="text-red-500" /> VIDEO HƯỚNG DẪN CỦA TRUNG TÂM
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">{videos.length} video đào tạo</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map(m => (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
                      className="group block rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-0.5">
                      <div className="relative aspect-video bg-gradient-to-br from-purple-500 to-indigo-600 overflow-hidden flex items-center justify-center">
                        <PlayCircle size={48} className="text-white/80 drop-shadow-lg group-hover:scale-110 transition-transform" />
                        {m.duration && (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded font-mono">{m.duration}</span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-bold text-sm text-gray-800 line-clamp-1">{m.title}</p>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-2 ql-desc" dangerouslySetInnerHTML={{ __html: m.desc }} />
                        {m.createdAt && <p className="text-[10px] text-gray-300 mt-1">📅 {m.createdAt}</p>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Quy trình hướng dẫn */}
            {guides.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <FileText size={18} className="text-blue-600" /> QUY TRÌNH HƯỚNG DẪN
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Quy trình chuẩn cho giảng viên tại Thắng Tin Học</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {guides.map(g => (
                    <div key={g.id} className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-blue-50/30 hover:border-blue-200 transition-all cursor-pointer group">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
                        {g.icon || '📄'}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-800">{g.title}</p>
                        <div className="text-xs text-gray-500 mt-1 leading-relaxed ql-desc" dangerouslySetInnerHTML={{ __html: g.desc }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tài liệu */}
            {files.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Download size={18} className="text-green-600" /> TÀI LIỆU CỦA GIẢNG VIÊN
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">File mẫu, slide, bài tập dùng trong giảng dạy</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {files.map(m => (
                    <div key={m.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-sm ${
                          m.fileType === 'PDF' ? 'bg-red-500' : m.fileType === 'PPTX' ? 'bg-orange-500' : 'bg-green-500'
                        }`}>
                          {m.fileType || 'FILE'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{m.title}</p>
                          <div className="text-xs text-gray-400 mt-0.5 ql-desc" dangerouslySetInnerHTML={{ __html: m.desc }} />
                          {m.fileSize && <p className="text-[10px] text-gray-300 mt-0.5">{m.fileSize}</p>}
                        </div>
                      </div>
                      <button className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors">
                        <Download size={14} /> Tải về
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {videos.length === 0 && guides.length === 0 && files.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <BookOpen size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-semibold">Chưa có nội dung đào tạo</p>
                <p className="text-xs text-gray-400 mt-1">Admin sẽ cập nhật video, quy trình và tài liệu cho giảng viên.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TeacherFinanceAndTraining;
