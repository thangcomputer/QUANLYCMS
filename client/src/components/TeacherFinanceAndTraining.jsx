import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, PlayCircle, Download, Calendar as CalendarIcon,
  Clock, TrendingUp, CreditCard,
  CheckCircle2, FileText, Video,
  BookOpen, AlertCircle, BarChart, FileSpreadsheet, FileBox
} from 'lucide-react';
import NavArrow from './ui/NavArrow';
import { useLocation } from 'react-router-dom';
import { useModal } from '../utils/Modal.jsx';
import api, { getRolePrefix } from '../services/api';
import { sanitizeCsvField } from '../utils/csvSanitizer';

const isPaidTxStatus = (status) => ['completed', 'paid', 'confirmed'].includes(String(status || ''));
const isPendingTxStatus = (status) => !isPaidTxStatus(status);

function paymentDateLabel(p) {
  if (p?.date) return String(p.date);
  if (p?.createdAt) return new Date(p.createdAt).toLocaleDateString('vi-VN');
  return '';
}

function paymentStatusLabel(p) {
  return isPaidTxStatus(p?.status) ? 'Đã nhận' : 'Chưa nhận';
}

function el(tag, styles, text) {
  const node = document.createElement(tag);
  if (styles) node.style.cssText = styles;
  if (text != null && text !== '') node.textContent = String(text);
  return node;
}

/** Bảng PDF cùng cột/dòng với CSV (Tháng, Ngày chuyển, Số tiền, Số buổi, Trạng thái, Ghi chú). */
function buildFinanceStatementNode({
  teacherName, generatedAt, totalEarned, totalPending, totalSessions, filterLabel, rows,
}) {
  const wrap = el('div', `
    width:900px;background:#fff;padding:28px 28px 20px;box-sizing:border-box;
    font-family:Arial,Helvetica,sans-serif;color:#0f172a;
  `);

  wrap.appendChild(el('div', 'font-size:11px;letter-spacing:.12em;font-weight:700;color:#64748b;text-transform:uppercase;', 'SAO KÊ THU NHẬP'));
  wrap.appendChild(el('div', 'font-size:22px;font-weight:800;margin:4px 0 2px;', teacherName || 'Giảng viên'));
  wrap.appendChild(el('div', 'font-size:12px;color:#64748b;margin-bottom:16px;', `Xuất ngày ${generatedAt}${filterLabel ? ` · Bộ lọc: ${filterLabel}` : ''}`));

  const stats = el('div', 'display:flex;gap:12px;margin-bottom:18px;');
  [
    ['Đã nhận', `${Number(totalEarned || 0).toLocaleString('vi-VN')}đ`, '#059669'],
    ['Chưa nhận', `${Number(totalPending || 0).toLocaleString('vi-VN')}đ`, '#d97706'],
    ['Tổng buổi đã dạy', String(totalSessions || 0), '#e11d48'],
  ].forEach(([label, value, color]) => {
    const card = el('div', 'flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;');
    card.appendChild(el('div', 'font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;', label));
    card.appendChild(el('div', `font-size:16px;font-weight:800;margin-top:4px;color:${color};`, value));
    stats.appendChild(card);
  });
  wrap.appendChild(stats);

  const table = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Tháng', 'Ngày chuyển', 'Số tiền (VNĐ)', 'Số buổi', 'Trạng thái', 'Ghi chú'].forEach((h, i) => {
    const th = el('th', `
      text-align:${i === 2 || i === 3 ? 'right' : 'left'};padding:8px 8px;background:#0f172a;color:#fff;
      font-size:11px;font-weight:700;border:1px solid #0f172a;
    `, h);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = el('td', 'padding:16px 8px;text-align:center;color:#94a3b8;border:1px solid #e2e8f0;', 'Không có giao dịch nào');
    td.colSpan = 6;
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.style.background = idx % 2 ? '#f8fafc' : '#fff';
      const cells = [
        [p.month || '', 'left'],
        [paymentDateLabel(p), 'left'],
        [`${Number(p.amount || 0).toLocaleString('vi-VN')}`, 'right'],
        [String(p.sessions || 0), 'right'],
        [paymentStatusLabel(p), 'left'],
        [p.note || p.description || '', 'left'],
      ];
      cells.forEach(([text, align]) => {
        tr.appendChild(el('td', `padding:8px;border:1px solid #e2e8f0;text-align:${align};vertical-align:top;`, text));
      });
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  const filteredSum = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const foot = el('div', 'display:flex;justify-content:space-between;margin-top:14px;font-size:12px;');
  foot.appendChild(el('span', 'color:#64748b;', `${rows.length} dòng`));
  foot.appendChild(el('span', 'font-weight:800;', `Tổng (theo bộ lọc): ${filteredSum.toLocaleString('vi-VN')}đ`));
  wrap.appendChild(foot);

  return wrap;
}

function addCanvasPagesToPdf(pdf, canvas) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL('image/png');
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }
}
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
  const [isLoadingTraining, setIsLoadingTraining] = useState(false);
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [courseTab, setCourseTab] = useState('video');

  useEffect(() => {
    if (!isTraining) {
      if (!teacherId) {
        setMyPayments([]);
        setFinanceStats({ totalSessions: 0, unpaidAmount: 0, paidAmount: 0, salaryPerSession: 0 });
        setIsLoadingFinance(false);
        return;
      }
      setIsLoadingFinance(true);
      Promise.all([
        api.transactions.getByTeacher(teacherId).catch(() => ({ success: false })),
        api.teachers.getFinance(teacherId).catch(() => ({ success: false })),
      ]).then(([txRes, finRes]) => {
        if (txRes && txRes.success) setMyPayments(txRes.data || []);
        if (finRes && finRes.success) setFinanceStats(finRes.data || { totalSessions: 0, unpaidAmount: 0, paidAmount: 0, salaryPerSession: 0 });
      }).finally(() => setIsLoadingFinance(false));
      return;
    }

    setIsLoadingTraining(true);
    api.trainingLms.getTeacherOverview()
      .then((res) => {
        if (res?.success) setCourses(res.data?.courses || []);
        else setCourses([]);
      })
      .catch(() => setCourses([]))
      .finally(() => setIsLoadingTraining(false));
  }, [isTraining, teacherId]);

  const totalEarned = financeStats.paidAmount || 0;
  const totalPending = financeStats.unpaidAmount || 0;
  const totalSessions = financeStats.totalSessions || 0;
  const [filterStatus, setFilterStatus] = useState('all');

  /** Gộp transaction thật + dòng hoa hồng chưa chi (tính từ buổi completed chưa thanh toán) */
  const displayPayments = useMemo(() => {
    const list = (myPayments || []).map((p) => ({
      ...p,
      id: p.id || p._id,
    }));

    const unpaid = Number(financeStats.unpaidAmount) || 0;
    if (unpaid > 0) {
      const rate = Number(financeStats.salaryPerSession) || 0;
      const sessions = rate > 0 ? Math.round(unpaid / rate) : 0;
      list.unshift({
        id: 'synthetic-pending-commission',
        amount: unpaid,
        status: 'pending',
        sessions,
        month: 'Hiện tại',
        date: new Date().toLocaleDateString('vi-VN'),
        createdAt: new Date().toISOString(),
        note: sessions > 0
          ? `Hoa hồng ${sessions} buổi dạy đã hoàn thành — chờ Admin chuyển`
          : 'Hoa hồng buổi dạy đã hoàn thành — chờ Admin chuyển',
        _synthetic: true,
      });
    }
    return list;
  }, [myPayments, financeStats.unpaidAmount, financeStats.salaryPerSession]);

  const filteredPayments = useMemo(() => {
    if (filterStatus === 'all') return displayPayments;
    if (filterStatus === 'paid') return displayPayments.filter((p) => isPaidTxStatus(p.status));
    return displayPayments.filter((p) => isPendingTxStatus(p.status));
  }, [displayPayments, filterStatus]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const dataObj = {};
    myPayments.filter((p) => isPaidTxStatus(p.status)).forEach((p) => {
        const key = p.month || 'Không rõ';
        dataObj[key] = (dataObj[key] || 0) + (p.amount || 0);
    });
    const arr = Object.entries(dataObj).map(([month, amount]) => ({ month, amount }));
    return arr.sort((a,b) => a.month.localeCompare(b.month));
  }, [myPayments]);

  const maxAmount = Math.max(...chartData.map(d => d.amount), 1); // Avoid division by zero

  const handleExportCSV = () => {
    try {
      let csvContent = "\uFEFF";
      csvContent += "Tháng,Ngày chuyển,Số tiền (VNĐ),Số buổi,Trạng thái,Ghi chú\n";
      filteredPayments.filter((p) => !p._synthetic).forEach(p => {
          const row = `"${sanitizeCsvField(p.month)}","${sanitizeCsvField(paymentDateLabel(p))}","${p.amount}","${p.sessions || 0}","${paymentStatusLabel(p)}","${sanitizeCsvField(p.note || '').replace(/"/g, '""')}"`;
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
    const filterLabel = filterStatus === 'paid'
      ? 'Đã nhận'
      : filterStatus === 'pending'
        ? 'Chưa nhận'
        : 'Tất cả';
    let mount = null;
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      mount = buildFinanceStatementNode({
        teacherName,
        generatedAt: new Date().toLocaleDateString('vi-VN'),
        totalEarned,
        totalPending,
        totalSessions,
        filterLabel: filterStatus === 'all' ? '' : filterLabel,
        rows: filteredPayments.filter((p) => !p._synthetic),
      });
      mount.style.position = 'fixed';
      mount.style.left = '-12000px';
      mount.style.top = '0';
      document.body.appendChild(mount);

      const canvas = await html2canvas(mount, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      addCanvasPagesToPdf(pdf, canvas);
      pdf.save(`ThuNhap_${teacherName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      showModal({
        title: 'Lỗi xuất file',
        content: 'Không thể xuất PDF: ' + (e?.message || 'lỗi không xác định'),
        type: 'error',
      });
    } finally {
      if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    }
  };

  return (
    <div className="bg-transparent h-full">
      <div className="space-y-6">

        {!isTraining ? (
          /* ════════ TÀI CHÍNH ════════ */
          <div id="finance-report">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <DollarSign size={20} className="text-green-600" /> Tài chính & Hoa hồng
              </h2>
              <p className="text-xs text-gray-400">GV: {teacherName}</p>
            </div>

            {/* Stat Cards — Fintech soft cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="col-span-2 sm:col-span-1 bg-white shadow-sm border border-slate-100 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Tổng đã nhận</p>
                </div>
                <p className="text-2xl sm:text-3xl font-black mt-1 text-emerald-600 tabular-nums">{totalEarned.toLocaleString('vi-VN')}đ</p>
                <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                  <TrendingUp size={12} aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs">Tổng các giao dịch đã xác nhận</span>
                </div>
              </div>
              <div className="bg-white shadow-sm border border-slate-100 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle size={16} className="text-amber-500 shrink-0" aria-hidden="true" />
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Chưa nhận</p>
                </div>
                <p className="text-xl sm:text-3xl font-black mt-1 text-amber-500 tabular-nums">{totalPending.toLocaleString('vi-VN')}đ</p>
                <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                  <AlertCircle size={12} aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs">Đang chờ Admin chuyển</span>
                </div>
              </div>
              <div className="bg-white shadow-sm border border-slate-100 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarIcon size={16} className="text-rose-500 shrink-0" aria-hidden="true" />
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Tổng buổi đã dạy</p>
                </div>
                <p className="text-xl sm:text-3xl font-black mt-1 text-rose-500 tabular-nums">{totalSessions}</p>
                <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                  <CalendarIcon size={12} aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs">Tất cả các tháng</span>
                </div>
              </div>
            </div>

            {/* Báo cáo & Biểu đồ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 mt-4 sm:mt-6">
               <div className="lg:col-span-8 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                     <BarChart className="text-blue-600 shrink-0" size={18} aria-hidden="true" />
                     <h3 className="text-sm sm:text-base font-extrabold text-slate-800 uppercase tracking-tight">Biểu đồ thu nhập</h3>
                  </div>
                  <div className="min-h-[140px] sm:min-h-[180px] h-[140px] sm:h-[180px] w-full flex items-end justify-center gap-4 sm:gap-6 md:gap-10 mt-1 sm:mt-2 pb-8 sm:pb-10 border-b border-dashed border-slate-200 px-1 sm:px-2 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-200">
                     {chartData.length > 0 ? chartData.map((d, i) => (
                         <div key={i} className="w-12 sm:w-16 md:w-20 flex-shrink-0 flex flex-col items-center justify-end h-full gap-2 group relative">
                             <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg pointer-events-none whitespace-nowrap z-20">
                                 {d.amount.toLocaleString('vi-VN')}đ
                             </div>
                             <div className="w-full bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t-xl transition-all duration-700 ease-out hover:from-indigo-500 hover:to-sky-300 cursor-pointer shadow-md shadow-indigo-900/10" 
                                  style={{ height: `${(d.amount / maxAmount) * 85}%`, minHeight: '10%' }} />
                             <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 absolute -bottom-8 truncate w-full text-center tracking-tight">
                                {d.month.replace('Tháng ', 'T')}
                             </span>
                         </div>
                     )) : (
                         <div className="w-full min-h-[100px] h-full flex flex-col items-center justify-center text-sm text-slate-400 font-medium gap-1.5">
                           <BarChart size={22} className="text-slate-300" aria-hidden="true" />
                           Chưa có dữ liệu thống kê
                         </div>
                     )}
                  </div>
               </div>

               <div className="lg:col-span-4 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100">
                  <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-tight mb-1 flex items-center gap-2 text-slate-800">
                    <Download size={18} className="text-slate-600 shrink-0" aria-hidden="true" /> Xuất Báo Cáo
                  </h3>
                  <p className="text-slate-500 text-xs font-medium mb-4">Tải xuống sao kê thu nhập của bạn</p>
                  <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={handleExportPDF} className="bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 font-medium text-xs py-2.5 px-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-11">
                          <FileBox size={16} className="text-rose-500 shrink-0" aria-hidden="true" />
                          <span className="truncate">PDF</span>
                      </button>
                      <button type="button" onClick={handleExportCSV} className="bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 font-medium text-xs py-2.5 px-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-11">
                          <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
                          <span className="truncate">CSV</span>
                      </button>
                  </div>
               </div>
            </div>

            {/* Payment History */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 mt-4 sm:mt-6 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 space-y-3">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard size={16} className="text-emerald-600 shrink-0" aria-hidden="true" /> Lịch sử chuyển tiền hoa hồng
                </h3>
                <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-0.5 w-full sm:w-auto">
                  {[
                    { key: 'all', label: 'Tất cả' },
                    { key: 'paid', label: 'Đã nhận' },
                    { key: 'pending', label: 'Chưa nhận' },
                  ].map(f => (
                    <button key={f.key} type="button" onClick={() => setFilterStatus(f.key)}
                      className={`flex-1 sm:flex-none text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                        filterStatus === f.key
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-50">
                {filteredPayments.map(p => (
                  <div key={p.id || p._id} className={`px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition ${isPendingTxStatus(p.status) ? 'bg-amber-50/30' : ''}`}>
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${
                        isPaidTxStatus(p.status) ? 'bg-emerald-100' : 'bg-amber-100'
                      }`}>
                        {isPaidTxStatus(p.status)
                          ? <CheckCircle2 size={18} className="text-emerald-600" />
                          : <Clock size={18} className="text-amber-600" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm sm:text-base tabular-nums">{p.amount ? p.amount.toLocaleString('vi-VN') : 0}đ</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {p._synthetic ? 'Tạm tính · ' : ''}{p.note || p.description}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <CalendarIcon size={10} /> {p.month} · {p.date || new Date(p.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p._synthetic ? (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold bg-amber-100 text-amber-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                          <Clock size={12} /> Tạm tính
                        </span>
                      ) : isPaidTxStatus(p.status) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                          <CheckCircle2 size={12} /> Đã nhận
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold bg-amber-100 text-amber-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                          <Clock size={12} /> Đang chờ
                        </span>
                      )}
                      {p.sessions > 0 && <p className="text-[10px] text-slate-400 mt-1">{p.sessions} buổi</p>}
                    </div>
                  </div>
                ))}

                {filteredPayments.length === 0 && (
                  <div className="px-4 sm:px-6 py-10 sm:py-12 text-center text-slate-400">
                    <DollarSign size={36} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-sm">Không có giao dịch nào</p>
                  </div>
                )}
              </div>

              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-dashed border-slate-200 pt-3">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs sm:text-sm text-slate-500">Tổng đã nhận:</span>
                  <span className="text-base sm:text-lg font-black text-emerald-700 tabular-nums">{totalEarned.toLocaleString('vi-VN')}đ</span>
                </div>
                {totalPending > 0 && (
                  <div className="flex justify-between items-center mt-1.5 gap-3">
                    <span className="text-xs sm:text-sm text-slate-500">Chờ nhận:</span>
                    <span className="text-base sm:text-lg font-black text-amber-600 tabular-nums">{totalPending.toLocaleString('vi-VN')}đ</span>
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
                   <button onClick={() => setActiveCourse(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold flex items-center gap-1 mb-2 transition-colors">
                     <NavArrow size={16} direction="back" className="text-slate-400" />
                     Quay lại danh sách
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
                          {(activeCourse.videos[activeVideoIndex] || activeCourse.videos[0])?.url ? (
                            <iframe
                              src={(activeCourse.videos[activeVideoIndex] || activeCourse.videos[0]).url}
                              className="w-full h-full"
                              allowFullScreen
                              title={(activeCourse.videos[activeVideoIndex] || activeCourse.videos[0]).title}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">Chưa có video bài giảng nào</div>
                          )}
                       </div>
                       <div>
                         <h3 className="text-xl font-bold text-slate-800">
                           {(activeCourse.videos[activeVideoIndex] || activeCourse.videos[0])?.title || 'Bài giảng đang được cập nhật'}
                         </h3>
                       </div>
                    </div>
                    <div className="lg:col-span-1 border border-slate-100 bg-white rounded-2xl overflow-hidden self-start">
                       <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                         <h4 className="font-bold text-slate-700 text-sm">Danh sách bài học</h4>
                       </div>
                       <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                         {(activeCourse.videos || []).map((vid, idx) => (
                           <button
                             key={idx}
                             type="button"
                             onClick={() => setActiveVideoIndex(idx)}
                             className={`w-full text-left px-5 py-4 hover:bg-blue-50 transition-colors group flex gap-3 ${activeVideoIndex === idx ? 'bg-blue-50' : ''}`}
                           >
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
                    {(activeCourse.files || []).length === 0 ? (
                      <div className="text-center py-12 text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-200">Khóa học này chưa có tài liệu đính kèm.</div>
                    ) : (
                      activeCourse.files.map((file, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:border-green-200 transition-colors">
                           <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-sm ${file.type === 'PDF' ? 'bg-red-500' : file.type === 'DOCX' ? 'bg-red-500' : 'bg-green-500'}`}>{file.type}</div>
                              <div>
                                <h4 className="font-bold text-slate-700">{file.title}</h4>
                                <p className="text-xs text-slate-400 mt-1 font-semibold">{file.size}</p>
                              </div>
                           </div>
                           {file.url ? (
                             <a href={file.url} target="_blank" rel="noreferrer" className="px-5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors">
                               <Download size={14} /> Tải file
                             </a>
                           ) : (
                             <span className="px-5 py-2.5 text-xs text-slate-400 font-bold">Chưa có link</span>
                           )}
                        </div>
                      ))
                    )}
                 </div>
               )}

               {courseTab === 'notice' && (
                 <div className="max-w-4xl mx-auto space-y-4">
                    {(activeCourse.notices || []).length === 0 ? (
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
                {isLoadingTraining ? 'Đang tải...' : `Hiển thị ${courses.length} khóa học`}
              </p>
            </div>

            {isLoadingTraining ? (
              <div className="py-20 text-center text-slate-400 font-bold">Đang tải khóa đào tạo...</div>
            ) : courses.length === 0 ? (
              <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <BookOpen size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">Chưa có khóa đào tạo</p>
                <p className="text-xs text-slate-400 mt-1">Admin cần thêm nội dung ở tab Đào tạo GV</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {courses.map(course => (
                 <div
                   onClick={() => { setActiveCourse(course); setActiveVideoIndex(0); setCourseTab('video'); }}
                   key={course.id}
                   className="bg-white rounded-[2rem] p-8 pb-6 border border-slate-100 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col relative overflow-hidden"
                 >
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-slate-50 rounded-full group-hover:bg-blue-50 transition-colors pointer-events-none" />
                    
                    <div className="flex-1 flex justify-center py-4 relative z-10">
                      <CircularProgress progress={course.progress || 0} />
                    </div>
                    
                    <div className="mt-4 text-center pb-2 border-b border-dashed border-slate-100 z-10">
                      <h3 className="font-extrabold text-slate-800 text-lg group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">{course.title}</h3>
                    </div>

                    <div className="flex justify-between items-center mt-4 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                       <span className="flex items-center gap-1"><Video size={14} className="text-blue-400" /> {(course.videos || []).length} VIDEO</span>
                       <span className="flex items-center gap-1"><FileBox size={14} className="text-green-400" /> {(course.files || []).length} TÀI LIỆU</span>
                    </div>
                 </div>
               ))}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherFinanceAndTraining;
