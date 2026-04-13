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

const MOCK_COURSES = [
  { id: 1, title: 'Đào tạo Giảng viên Mới', progress: 0, 
    videos: [{ title: 'Giới thiệu về Thắng Tin Học', url: 'https://youtube.com/embed/demo1', duration: '10:35' }, { title: 'Tổng quan công việc', url: 'https://youtube.com/embed/demo1b', duration: '15:20' }],
    files: [{ title: 'Quy trình giảng dạy.pdf', type: 'PDF', size: '2 MB' }, { title: 'Sổ tay Giảng viên.docx', type: 'DOCX', size: '1 MB' }],
    notices: ['Chào mừng các bạn đến với TT', 'Hãy xem hết các video trước khi nhận lớp']
  },
  { id: 2, title: 'Kỹ năng Đứng lớp Chuyên sâu', progress: 45, 
    videos: [{ title: 'Xử lý tình huống học viên yếu', url: 'https://youtube.com/embed/demo2', duration: '40:12' }],
    files: [{ title: 'Quy trình xử lý.docx', type: 'DOCX', size: '500 KB' }],
    notices: ['Nhớ nộp bài thu hoạch trước 15/4 ngay sau khi xem video']
  },
  { id: 3, title: 'Khóa học Excel Nâng cao', progress: 100, 
    videos: [{ title: 'Hàm logic phức tạp', url: 'https://youtube.com/embed/demo3', duration: '35:00' }],
    files: [{ title: 'Bài tập thực hành.xlsx', type: 'EXCEL', size: '3.5 MB' }],
    notices: []
  },
  { id: 4, title: 'Bảo mật và An toàn thông tin', progress: 80, 
    videos: [{ title: 'Bảo quản dữ liệu học viên', url: 'https://youtube.com/embed/demo4', duration: '20:10' }],
    files: [],
    notices: ['Bắt buộc hoàn thành trong tháng 4']
  }
];

const CircularProgress = ({ progress }) => {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  let strokeColor = 'text-gray-100';
  let pathColor = 'text-blue-500';
  if (progress === 0) pathColor = 'text-gray-300';
  else if (progress === 100) pathColor = 'text-green-500';

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-28 h-28 transform -rotate-90 drop-shadow-sm">
        <circle cx="56" cy="56" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className={strokeColor} />
        <circle cx="56" cy="56" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${pathColor} transition-all duration-1000 ease-out`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        {progress === 100 ? (
           <CheckCircle2 size={32} className="text-green-500 drop-shadow-sm" />
        ) : (
           <span className="text-xl font-black text-gray-800 tracking-tighter">{progress}%</span>
        )}
      </div>
    </div>
  );
};

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
  const [activeCourse, setActiveCourse] = useState(null);
  const [courseTab, setCourseTab] = useState('video');

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
    } catch(e) { void 0 }
    finally { el.className = oldClass; }
  };

  return (
    <div className="bg-transparent h-full">
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
                  <div className="h-[220px] w-full flex items-end justify-center gap-6 md:gap-10 mt-8 pb-4 border-b border-dashed border-slate-200 px-2 overflow-x-auto">
                     {chartData.length > 0 ? chartData.map((d, i) => (
                         <div key={i} className="w-16 md:w-20 flex-shrink-0 flex flex-col items-center justify-end h-full gap-2 group relative">
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

        ) : activeCourse ? (
          /* ════════ CHI TIẾT KHÓA HỌC (TABS) ════════ */
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px] flex flex-col">
             {/* Header */}
             <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                   <button onClick={() => setActiveCourse(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold flex items-center gap-2 mb-2 transition-colors">
                     ← Quay lại danh sách
                   </button>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tight">{activeCourse.title}</h2>
                </div>
                <CircularProgress progress={activeCourse.progress} />
             </div>

             {/* TabsMenu */}
             <div className="flex px-8 border-b border-slate-100 bg-white">
                <button onClick={() => setCourseTab('video')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'video' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                  <Video size={14} className="inline mr-2" /> BÀI GIẢNG VIDEO
                </button>
                <button onClick={() => setCourseTab('data')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'data' ? 'text-green-600 border-green-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                  <FileBox size={14} className="inline mr-2" /> TÀI LIỆU CỦA KHÓA
                </button>
                <button onClick={() => setCourseTab('notice')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'notice' ? 'text-orange-600 border-orange-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                  <AlertCircle size={14} className="inline mr-2" /> THÔNG BÁO TỪ ADMIN
                </button>
             </div>

             {/* Tab Content */}
             <div className="p-8 flex-1 bg-slate-50/50">
               {courseTab === 'video' && (
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-4">
                       <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-200">
                          {activeCourse.videos[0] ? (
                            <iframe src={activeCourse.videos[0].url} className="w-full h-full" allowFullScreen></iframe>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">Chưa có video bài giảng nào</div>
                          )}
                       </div>
                       <div>
                         <h3 className="text-xl font-bold text-slate-800">{activeCourse.videos[0]?.title || 'Bài giảng đang được cập nhật'}</h3>
                       </div>
                    </div>
                    <div className="lg:col-span-1 border border-slate-100 bg-white rounded-2xl overflow-hidden self-start">
                       <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                         <h4 className="font-bold text-slate-700 text-sm">Danh sách bài học</h4>
                       </div>
                       <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                         {activeCourse.videos.map((vid, idx) => (
                           <button key={idx} className="w-full text-left px-5 py-4 hover:bg-blue-50 transition-colors group flex gap-3">
                              <div className="text-slate-300 font-black mt-0.5 group-hover:text-blue-400">{String(idx + 1).padStart(2, '0')}</div>
                              <div>
                                <p className="font-semibold text-slate-700 text-sm group-hover:text-blue-700 line-clamp-2 leading-snug">{vid.title}</p>
                                <p className="text-[10px] text-slate-400 font-bold mt-1.5 flex items-center gap-1"><Clock size={10} /> {vid.duration}</p>
                              </div>
                           </button>
                         ))}
                       </div>
                    </div>
                 </div>
               )}

               {courseTab === 'data' && (
                 <div className="max-w-4xl mx-auto space-y-4">
                    {activeCourse.files.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-200">Khóa học này chưa có tài liệu đính kèm.</div>
                    ) : (
                      activeCourse.files.map((file, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:border-green-200 transition-colors">
                           <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-sm ${file.type === 'PDF' ? 'bg-red-500' : file.type === 'DOCX' ? 'bg-blue-500' : 'bg-green-500'}`}>{file.type}</div>
                              <div>
                                <h4 className="font-bold text-slate-700">{file.title}</h4>
                                <p className="text-xs text-slate-400 mt-1 font-semibold">{file.size}</p>
                              </div>
                           </div>
                           <button className="px-5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors">
                             <Download size={14} /> Tải file
                           </button>
                        </div>
                      ))
                    )}
                 </div>
               )}

               {courseTab === 'notice' && (
                 <div className="max-w-4xl mx-auto space-y-4">
                    {activeCourse.notices.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-200">Chưa có thông báo nào.</div>
                    ) : (
                      activeCourse.notices.map((n, idx) => (
                        <div key={idx} className="bg-orange-50 border-l-4 border-orange-400 p-5 rounded-r-2xl">
                          <p className="text-sm font-semibold text-orange-900 leading-relaxed">{n}</p>
                        </div>
                      ))
                    )}
                 </div>
               )}
             </div>
          </div>
        ) : (
          /* ════════ ĐÀO TẠO TỔNG QUAN (GRID) ════════ */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                <BookOpen size={28} className="text-purple-600" /> Các khóa đào tạo
              </h2>
              <p className="text-sm font-bold text-gray-400 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
                Hiển thị {MOCK_COURSES.length} khóa học
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {MOCK_COURSES.map(course => (
                 <div onClick={() => { setActiveCourse(course); setCourseTab('video'); }} key={course.id} className="bg-white rounded-[2rem] p-8 pb-6 border border-slate-100 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-slate-50 rounded-full group-hover:bg-blue-50 transition-colors pointer-events-none" />
                    
                    <div className="flex-1 flex justify-center py-4 relative z-10">
                      <CircularProgress progress={course.progress} />
                    </div>
                    
                    <div className="mt-4 text-center pb-2 border-b border-dashed border-slate-100 z-10">
                      <h3 className="font-extrabold text-slate-800 text-lg group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">{course.title}</h3>
                    </div>

                    <div className="flex justify-between items-center mt-4 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                       <span className="flex items-center gap-1"><Video size={14} className="text-blue-400" /> {course.videos.length} VIDEO</span>
                       <span className="flex items-center gap-1"><FileBox size={14} className="text-green-400" /> {course.files.length} TÀI LIỆU</span>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherFinanceAndTraining;
