import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Send, ChevronLeft, ChevronRight,
  Upload, CheckCircle, Download, Paperclip
} from 'lucide-react';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import { useSocket } from '../context/SocketContext';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';

// ─── Dữ liệu câu hỏi mẫu ──────────────────────────────────────────────────────
const QUESTIONS_DB = {
  word: [
    { id: 1, text: 'Để tạo một văn bản mới trống, bạn nhấn tổ hợp phím:', options: ['CTRL + C', 'CTRL + N', 'CTRL + D', 'CTRL + Z'], answer: 1 },
    { id: 2, text: 'Lệnh nào dùng để căn đều hai lề (Justify)?',           options: ['CTRL + L', 'CTRL + R', 'CTRL + E', 'CTRL + J'], answer: 3 },
    { id: 3, text: 'Phím tắt in đậm (Bold) trong Word là:',                options: ['CTRL + I', 'CTRL + B', 'CTRL + U', 'CTRL + D'], answer: 1 },
    { id: 4, text: 'Chèn bảng biểu (Table) vào Word, vào tab:',           options: ['Home', 'Insert', 'View', 'Layout'],             answer: 1 },
    { id: 5, text: 'Track Changes trong Word dùng để:',                    options: ['Theo dõi thay đổi văn bản', 'Đổi font chữ', 'In tài liệu', 'Lưu file'], answer: 0 },
    { id: 6, text: 'Để ngắt trang trong Word, bạn dùng:',                 options: ['CTRL + Enter', 'CTRL + N', 'CTRL + P', 'CTRL + B'], answer: 0 },
    { id: 7, text: 'Mail Merge trong Word dùng để:',                       options: ['Thiết kế bảng', 'Gộp văn bản từ nhiều nguồn', 'In hàng loạt thư từ danh sách', 'Tạo hiệu ứng'], answer: 2 },
    { id: 8, text: 'Phím tắt Undo (hoàn tác) trong Word là:',             options: ['CTRL + Y', 'CTRL + Z', 'CTRL + X', 'CTRL + A'], answer: 1 },
    { id: 9, text: 'Để xem tài liệu trước khi in (Print Preview):',       options: ['CTRL + F2', 'CTRL + P', 'File > Print', 'Cả 3 đều đúng'], answer: 3 },
    { id: 10, text: 'Header & Footer trong Word hiện ở:',                  options: ['Giữa trang', 'Đầu và cuối mỗi trang', 'Phần chú thích', 'Cạnh trang'], answer: 1 },
    { id: 11, text: 'Lệnh Find & Replace dùng phím tắt:',                  options: ['CTRL + H', 'CTRL + F', 'CTRL + G', 'CTRL + R'], answer: 0 },
    { id: 12, text: 'Để chèn ký hiệu đặc biệt (Symbol), vào:',            options: ['Insert > Symbol', 'Home > Symbol', 'View > Symbol', 'Layout > Symbol'], answer: 0 },
    { id: 13, text: 'Lưu file dưới dạng PDF trong Word 2016+:',           options: ['Save As > PDF', 'Export > PDF', 'File > Save As PDF', 'Cả A và B đều đúng'], answer: 3 },
    { id: 14, text: 'Để đánh số trang tự động trong Word, vào:',          options: ['Insert > Page Number', 'Home > Pages', 'View > Page', 'Format > Numbering'], answer: 0 },
    { id: 15, text: 'Paragraph Spacing dùng để điều chỉnh:',               options: ['Cỡ chữ', 'Khoảng cách giữa dòng', 'Khoảng cách giữa đoạn', 'Lề trang'], answer: 2 },
  ],
  excel: [
    { id: 1,  text: 'Hàm tính tổng trong Excel là:',                      options: ['COUNT', 'SUM', 'AVERAGE', 'MAX'],                answer: 1 },
    { id: 2,  text: 'VLOOKUP tìm kiếm theo:',                             options: ['Hàng ngang', 'Cột dọc', 'Ô đơn lẻ', 'Sheet'],   answer: 1 },
    { id: 3,  text: 'Phím tắt Insert hàng mới trong Excel:',             options: ['CTRL + +', 'CTRL + -', 'CTRL + R', 'CTRL + D'],  answer: 0 },
    { id: 4,  text: 'Hàm IF trả về kết quả dựa trên:',                   options: ['Điều kiện đúng/sai', 'Tổng số', 'Giá trị lớn nhất', 'Font chữ'], answer: 0 },
    { id: 5,  text: 'Pivot Table dùng để:',                               options: ['Vẽ biểu đồ', 'Tổng hợp & phân tích dữ liệu', 'Định dạng bảng', 'Lưu file'], answer: 1 },
    { id: 6,  text: 'Hàm đếm ô không trống trong Excel:',                options: ['COUNT', 'COUNTA', 'COUNTIF', 'COUNTBLANK'],       answer: 1 },
    { id: 7,  text: 'Ký tự cố định địa chỉ ô trong Excel là:',           options: ['#', '%', '$', '&'],                              answer: 2 },
    { id: 8,  text: 'Hàm CONCATENATE (hoặc &) dùng để:',                 options: ['Tính tổng', 'Nối chuỗi', 'Đếm ký tự', 'So sánh'], answer: 1 },
    { id: 9,  text: 'Freeze Panes trong Excel dùng để:',                  options: ['Đóng băng hàng/cột khi cuộn', 'Ẩn hàng', 'Lọc dữ liệu', 'Tô màu'], answer: 0 },
    { id: 10, text: 'Định dạng ngày tháng trong Excel thuộc nhóm:',       options: ['Number', 'Date', 'Text', 'Custom'],              answer: 0 },
    { id: 11, text: 'Hàm tìm giá trị lớn nhất trong Excel:',             options: ['MIN', 'MAX', 'LARGE', 'TOP'],                    answer: 1 },
    { id: 12, text: 'Data Validation dùng để:',                           options: ['Kiểm tra dữ liệu nhập vào', 'Lọc dữ liệu', 'Tạo biểu đồ', 'In bảng'], answer: 0 },
    { id: 13, text: 'HLOOKUP tìm kiếm theo:',                             options: ['Cột dọc', 'Hàng ngang', 'Sheet', 'Tên ô'],      answer: 1 },
    { id: 14, text: 'Phím tắt chọn toàn bộ bảng tính:',                  options: ['CTRL + A', 'CTRL + S', 'CTRL + E', 'CTRL + T'], answer: 0 },
    { id: 15, text: 'Conditional Formatting dùng để:',                    options: ['Định dạng theo điều kiện', 'In màu', 'Thêm hàng', 'Tính toán'], answer: 0 },
  ],
  powerpoint: [
    { id: 1,  text: 'Chèn Slide mới trong PowerPoint:',                   options: ['CTRL + M', 'CTRL + N', 'CTRL + D', 'CTRL + S'], answer: 0 },
    { id: 2,  text: 'Slide Master dùng để:',                              options: ['Thêm hiệu ứng', 'Tạo bố cục mẫu chung', 'Lưu bài', 'Chèn hình'], answer: 1 },
    { id: 3,  text: 'F5 trong PowerPoint:',                               options: ['Lưu file', 'Bắt đầu trình chiếu từ đầu', 'In ấn', 'Chèn slide'], answer: 1 },
    { id: 4,  text: 'Hiệu ứng chuyển slide gọi là:',                     options: ['Animation', 'Transition', 'Design', 'Layout'],   answer: 1 },
    { id: 5,  text: 'Xuất file sang PDF:',                                options: ['Save As > PDF', 'Export > PDF', 'File > Save As PDF', 'Cả A và B'], answer: 3 },
    { id: 6,  text: 'Để nhóm nhiều đối tượng (Group):',                   options: ['CTRL + G', 'CTRL + H', 'CTRL + K', 'CTRL + M'], answer: 0 },
    { id: 7,  text: 'SmartArt trong PowerPoint dùng để:',                 options: ['Chèn hình ảnh', 'Tạo biểu đồ thông tin đồ họa', 'Thêm bảng', 'Vẽ tự do'], answer: 1 },
    { id: 8,  text: 'Presenter View trong PowerPoint dùng để:',           options: ['Xem slide trên màn hình phụ', 'In slide', 'Chia sẻ file', 'Thêm ghi chú'], answer: 0 },
    { id: 9,  text: 'Phím tắt kết thúc trình chiếu sớm:',               options: ['ESC', 'F1', 'CTRL + Q', 'CTRL + W'],             answer: 0 },
    { id: 10, text: 'Sắp xếp thứ tự layer (đối tượng) dùng:',           options: ['Bring Forward / Send Backward', 'Group', 'Align', 'Rotate'], answer: 0 },
    { id: 11, text: 'Để chèn video vào slide:',                           options: ['Insert > Video', 'Home > Video', 'View > Video', 'Layout > Video'], answer: 0 },
    { id: 12, text: 'Morph transition xuất hiện từ phiên bản:',           options: ['2010', '2013', '2016', '2019'],                  answer: 2 },
    { id: 13, text: 'Để căn giữa đối tượng trên slide:',                 options: ['Align Center', 'Center Object', 'Format > Align', 'Distribute'], answer: 0 },
    { id: 14, text: 'Theme trong PowerPoint là:',                         options: ['Bộ màu + font + hiệu ứng chia sẻ chung', 'Loại slide', 'Hiệu ứng riêng', 'Kích thước slide'], answer: 0 },
    { id: 15, text: 'Để xem ghi chú (Notes) khi trình bày:',             options: ['View > Notes Page', 'Presenter View', 'Slide Show > Notes', 'Cả A và B'], answer: 3 },
  ],
};

const SUBJECT_META = {
  word:        { label: 'Microsoft Word',       short: 'Word',       examFile: 'De_thi_Word.docx',   time: 90 * 60 },
  excel:       { label: 'Microsoft Excel',      short: 'Excel',      examFile: 'De_thi_Excel.xlsx',  time: 90 * 60 },
  powerpoint:  { label: 'Microsoft PowerPoint', short: 'PowerPoint', examFile: 'De_thi_PPT.pptx',   time: 90 * 60 },
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, boldText, onConfirm, onCancel, confirmLabel = 'Nộp bài', cancelLabel = 'Làm tiếp' }) => (
  <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h3 className="font-bold text-gray-800 text-base mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-1">
        {boldText && <><strong>{boldText}</strong> </>}
        {message}
      </p>
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 font-semibold text-sm hover:bg-gray-50">{cancelLabel}</button>
        <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-bold text-sm transition-all">{confirmLabel}</button>
      </div>
    </div>
  </div>
);

// ─── Main StudentTest ─────────────────────────────────────────────────────────
const StudentTest = ({ subjectId = 'word', studentSbd = '11111', studentName = 'THIÊN TRANG', onBack }) => {
  const meta      = SUBJECT_META[subjectId] || SUBJECT_META.word;
  const questions = QUESTIONS_DB[subjectId] || QUESTIONS_DB.word;
  const TOTAL     = questions.length;

  // Socket & Data
  const session = JSON.parse(localStorage.getItem('student_user') || '{}');
  const STUDENT_ID = session.id || 101;
  const { students, updateStudent } = useData() || { students: [], updateStudent: ()=>{} };
  const { socket } = useSocket() || {};
  const student = students?.find(s => String(s.id) === String(STUDENT_ID));
  const { showModal } = useModal();
  const teacherId = student?.teacherId;

  const [tab, setTab]           = useState('trac_nghiem');
  const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);
  const [answers, setAnswers]   = useState(Array(TOTAL).fill(null));
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(meta.time);
  const [phase, setPhase]       = useState('test'); // test | result | banned
  const [banReason, setBanReason] = useState('');

  // Modals
  const [showSubmitConfirm, setShowSubmitConfirm]   = useState(false);
  const [showNoFileConfirm, setShowNoFileConfirm]   = useState(false);

  // Tự luận
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const timerRef   = useRef(null);
  const monitorRef = useRef(null);
  const fileRef    = useRef(null);

  // ── Timer ──
  useEffect(() => {
    if (phase !== 'test') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleSubmitFinal(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleViolation = useCallback((reason) => {
    clearInterval(timerRef.current);
    setBanReason(reason);
    setPhase('banned');
    
    // Phát cảnh báo qua socket cho Admin & Giảng viên
    if (socket) {
      socket.emit('exam:violation', {
        studentId: STUDENT_ID,
        studentName: session.name || studentName,
        teacherId: teacherId,
        course: meta.label,
        reason: reason
      });
    }
  }, [socket, STUDENT_ID, session.name, studentName, teacherId, meta.label]);

  // Lắng nghe lệnh khóa từ Admin/Giảng viên qua Socket
  useEffect(() => {
    if (!socket) return;
    const onLocked = (data) => {
      // Kiểm tra id student hoặc data có khớp không
      if (String(data.studentId) === String(STUDENT_ID)) {
        handleViolation(data.reason || "Bị khóa bởi Giảng viên/Ban quản trị");
      }
    };
    socket.on('exam:locked', onLocked);
    return () => socket.off('exam:locked', onLocked);
  }, [socket, STUDENT_ID, handleViolation]);

  const handleAnswer = (qi, oi) => {
    const next = [...answers]; next[qi] = oi; setAnswers(next);
  };

  const updateExamProgress = useCallback((changes) => {
    if (!student || !updateStudent) return;
    const progress = student.examProgress || [];
    const idx = progress.findIndex(s => s.id === subjectId);
    let newProgress = [...progress];
    if (idx !== -1) {
      newProgress[idx] = { ...newProgress[idx], ...changes };
    } else {
      newProgress.push({ id: subjectId, ...changes });
    }
    updateStudent(student._id || student.id, { examProgress: newProgress });
  }, [student, updateStudent, subjectId]);

  const handleSubmitFinal = () => {
    const finalScore = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
    const finalPct = Math.round((finalScore / TOTAL) * 100);
    const passedTN = finalPct >= 50;

    setIsTracNghiemSubmitted(true);

    if (!passedTN) {
      // Rớt trắc nghiệm => khóa 7 ngày, về result
      clearInterval(timerRef.current);
      updateExamProgress({
        tracNghiem: { score: finalScore, total: TOTAL },
        thucHanh: 'chua_nop',
        status: 'khong_dat',
        lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
      setPhase('result');
    } else {
      // Đậu trắc nghiệm => chuyển sang tab tự luận
      updateExamProgress({
        tracNghiem: { score: finalScore, total: TOTAL },
        status: 'dang_thi'
      });
      setTab('tu_luan');
    }
  };

  const handleFinalTuLuan = () => {
    clearInterval(timerRef.current);
    updateExamProgress({
      thucHanh: 'da_nop',
      status: 'dat'
    });
    setPhase('result');
  };

  const trySubmit = () => {
    const unanswered = answers.filter(a => a === null).length;
    if (unanswered > 0) setShowSubmitConfirm(true);
    else handleSubmitFinal();
  };

  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else { setUploadDone(true); handleFinalTuLuan(); }
  };

  // Drag & drop
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadFile(file);
  };

  const score  = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
  const pct    = Math.round((score / TOTAL) * 100);
  const passed = pct >= 50;
  const mins   = Math.floor(timeLeft / 60);
  const secs   = timeLeft % 60;

  // ══════════════════════════════════════════════════════
  // BANNED
  // ══════════════════════════════════════════════════════
  if (phase === 'banned') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-red-700 to-red-600 px-8 py-6 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h2 className="text-white font-black text-xl">TẠM KHÓA QUYỀN THI</h2>
          <p className="text-red-200 text-sm mt-1">Hệ thống phát hiện vi phạm</p>
        </div>
        <div className="p-8 space-y-4 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-600 text-sm font-bold">{banReason}</p>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed">
            Hành vi vi phạm đã được báo cáo lập tức tới <strong className="text-gray-800">Giảng viên phụ trách</strong> và <strong className="text-gray-800">Ban quản trị</strong>.
            <br/><br/>
            Quyền thi của bạn bị khóa tạm thời. Vui lòng liên hệ giảng viên để giải trình.
          </p>
          <button onClick={() => onBack?.()} className="w-full mt-4 py-3 bg-gray-900 shadow-xl hover:bg-black text-white font-bold rounded-xl active:scale-95 transition-all">
            OK, TÔI ĐÃ HIỂU VÀ THOÁT
          </button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // RESULT
  // ══════════════════════════════════════════════════════
  if (phase === 'result') return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Simple result header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 md:px-8 py-4 flex items-center gap-4">
        <img src="/logo-thang-tin-hoc.svg" alt="Logo" className="h-7 brightness-0 invert" />
        <span className="text-white font-bold text-sm">Kết quả — {meta.label}</span>
      </div>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        {/* Score */}
        <div className={`rounded-2xl p-6 text-center ${passed ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
          <div className="text-5xl mb-3">{passed ? '🏆' : '😔'}</div>
          <h2 className={`text-2xl font-black ${passed ? 'text-green-700' : 'text-red-700'}`}>{passed ? 'ĐÃ ĐẠT!' : 'CHƯA ĐẠT'}</h2>
          <p className="text-4xl font-black mt-1 text-gray-800">{pct}%</p>
          <p className="text-gray-400 text-sm">Đúng {score}/{TOTAL} câu trắc nghiệm</p>
        </div>

        {/* Review */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {questions.map((q, i) => {
            const chosen = answers[i]; const correct = q.answer; const ok = chosen === correct;
            return (
              <div key={q.id} className={`bg-white rounded-xl p-3.5 border text-sm ${ok ? 'border-green-100' : 'border-red-100'}`}>
                <p className="font-semibold text-gray-700 mb-1">Câu {i + 1}: {q.text}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Bạn chọn: {chosen !== null ? q.options[chosen] : 'Bỏ qua'}
                  </span>
                  {!ok && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Đúng: {q.options[correct]}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nếu đậu trắc nghiệm thì hiện upload thực hành */}
        {passed && (
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm"><Paperclip size={15}/> Nộp bài tự luận</h3>
            {uploadDone ? (
              <div className="flex items-center gap-2 text-green-600 font-semibold p-3 bg-green-50 rounded-xl text-sm">
                <CheckCircle size={16}/> Đã nộp! File đã được gửi đến giám khảo.
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.pptx" className="hidden" onChange={e => setUploadFile(e.target.files[0])} />
                {uploadFile
                  ? <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 mb-3 text-sm"><span className="text-blue-700 font-medium truncate">{uploadFile.name}</span><button onClick={() => setUploadFile(null)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">×</button></div>
                  : <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm flex flex-col items-center gap-1 mb-3"><Upload size={20}/> Chọn file</button>
                }
                <button onClick={() => { if (!uploadFile) return; setUploadDone(true); handleFinalTuLuan(); }} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm">Nộp bài tự luận</button>
              </>
            )}
          </div>
        )}
        {/* Nếu rớt: thông báo khóa 7 ngày */}
        {!passed && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold text-sm">⏳ Bạn không đạt phần trắc nghiệm. Bài thi sẽ bị khóa trong 7 ngày trước khi có thể thi lại.</p>
          </div>
        )}
        <button onClick={() => onBack?.()} className="w-full py-3 bg-gray-800 hover:bg-black text-white font-bold rounded-xl">← Về Phòng Thi</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // TEST — Main Layout
  // ══════════════════════════════════════════════════════
  const q              = questions[currentQ];
  const answeredCount  = answers.filter(a => a !== null).length;
  const unanswered     = TOTAL - answeredCount;

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-sans">

      {/* ══════════ HEADER CARD — Floating dark rounded ══════════ */}
      <div className="px-3 md:px-6 pt-4 pb-0">
        <div className="bg-[#161d2f] rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">

              {/* ── LEFT column ── */}
              <div className="flex flex-col gap-4 min-w-0">
                {/* Trở về */}
                <button
                  onClick={() => { 
                    showModal({
                      title: 'Rời khỏi bài thi?',
                      content: 'Bạn có chắc chắn muốn rời khỏi bài thi không? Tiến độ làm bài của bạn sẽ không được lưu nếu bạn chưa nộp bài.',
                      type: 'question',
                      confirmText: 'Rời đi',
                      cancelText: 'Quay lại',
                      onConfirm: () => onBack?.()
                    });
                  }}
                  className="self-start flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
                >
                  <ArrowLeft size={13} /> Trở về
                </button>

                {/* Logo */}
                <img src="/logo-thang-tin-hoc.svg" alt="Logo" className="h-9 self-start" />

                {/* Timer box */}
                <div className="bg-[#0e1623] rounded-2xl px-4 py-3 self-start border border-white/5">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Thời gian còn lại</p>
                  <p className={`font-mono font-black text-3xl md:text-4xl tracking-wider leading-none ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                    {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
                  </p>
                </div>
              </div>

              {/* ── CENTER ── */}
              <div className="flex-1 flex flex-col items-center justify-center gap-2 pt-1">
                {/* Pill badge */}
                <div className="flex items-center gap-2 bg-red-900/40 border border-red-700/40 px-4 py-1.5 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 text-xs font-bold tracking-wide">HỆ THỐNG THI TRỰC TUYẾN</span>
                </div>
                {/* Subject title */}
                <div className="text-center">
                  <h1 className="text-white font-black text-3xl md:text-4xl tracking-tight">
                    Thi <span className="text-red-400">{meta.short}</span>
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">SBD: {studentSbd}</p>
                </div>
              </div>

              {/* ── RIGHT — Camera ── */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {/* Camera AI label */}
                <div className="flex items-center gap-1.5 text-right">
                  <div>
                    <p className="text-white text-xs font-semibold text-right">Giám sát qua Camera AI</p>
                    <p className="text-slate-500 text-[10px] text-right">Hệ thống tự động phát hiện vi phạm.</p>
                  </div>
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                </div>
                {/* Camera preview box */}
                <CameraHeaderPanel monitorRef={monitorRef} />
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ══════════ TABS ══════════ */}
      <div className="px-3 md:px-6 mt-3">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('trac_nghiem')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-all ${
                tab === 'trac_nghiem' ? 'text-gray-800 bg-white border-b-0' : 'text-gray-400 bg-gray-50/50 hover:text-gray-600'
              }`}
            >
              📝 Trắc nghiệm {isTracNghiemSubmitted && '✅'}
            </button>
            <button
              onClick={() => { if (isTracNghiemSubmitted) setTab('tu_luan'); }}
              disabled={!isTracNghiemSubmitted}
              className={`flex-1 py-3.5 text-sm font-semibold transition-all ${
                !isTracNghiemSubmitted
                  ? 'opacity-50 cursor-not-allowed text-gray-300 bg-gray-100'
                  : tab === 'tu_luan'
                    ? 'text-gray-800 bg-white border-b-0'
                    : 'text-gray-400 bg-gray-50/50 hover:text-gray-600'
              }`}
            >
              🖥 Tự luận {!isTracNghiemSubmitted && '🔒'}
            </button>
          </div>
          {/* Thin progress line */}
          <div className="h-0.5 bg-gray-100">
            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(answeredCount / TOTAL) * 100}%` }} />
          </div>

          {/* ── Trắc nghiệm ── */}
          {tab === 'trac_nghiem' && (
            <div className="p-4 md:p-6">
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-3">CÂU HỎI {currentQ + 1}/{TOTAL}</p>
              <p className="text-base font-bold text-gray-800 mb-5">
                {currentQ + 1}. {q.text}
              </p>
              <div className="space-y-2.5">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => { if (!isTracNghiemSubmitted) handleAnswer(currentQ, i); }}
                    disabled={isTracNghiemSubmitted}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl border text-left transition-all ${
                      answers[currentQ] === i
                        ? 'border-transparent bg-gray-900 text-white shadow-lg'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm text-gray-700'
                    } ${isTracNghiemSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      answers[currentQ] === i ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {['A','B','C','D'][i]}
                    </span>
                    <span className="text-sm font-medium">{opt}</span>
                  </button>
                ))}
              </div>

              {/* Nav */}
              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setCurrentQ(p => Math.max(0, p - 1))} disabled={currentQ === 0}
                  className="flex items-center gap-1.5 text-sm text-gray-500 disabled:opacity-30 hover:text-gray-700">
                  <ChevronLeft size={16}/> Trước
                </button>
                <span className="text-sm text-gray-400">{currentQ + 1} / {TOTAL}</span>
                <button onClick={() => setCurrentQ(p => Math.min(TOTAL - 1, p + 1))} disabled={currentQ === TOTAL - 1}
                  className="flex items-center gap-1.5 text-sm text-gray-500 disabled:opacity-30 hover:text-gray-700">
                  Tiếp <ChevronRight size={16}/>
                </button>
              </div>
            </div>
          )}

          {/* ── Tự luận ── */}
          {tab === 'tu_luan' && (
            <div className="p-4 md:p-6">
              {uploadDone ? (
                /* Success state */
                <div className="text-center py-10">
                  <div className="text-5xl mb-4">📬</div>
                  <h3 className="font-black text-gray-800 text-xl mb-2">Đã nộp bài tự luận!</h3>
                  <p className="text-gray-500 text-sm">File đã được gửi đến giám khảo.</p>
                  <button onClick={() => onBack?.()} className="mt-6 px-6 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-semibold hover:bg-gray-50">Quay về danh sách môn thi</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Exam file download */}
                  <div className="flex gap-4">
                    <div className="w-32 flex-shrink-0 bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Tài liệu đính kèm</p>
                      <a href="#" className="flex items-center gap-1.5 text-xs text-red-600 font-semibold hover:text-red-700 justify-center">
                        <Download size={13}/> Tải file đề thi
                      </a>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 mb-2">Đề thi {meta.short}</h3>
                      <p className="text-sm text-red-500">Thí sinh tải file đề về máy và chia đôi màn hình để làm cho dễ và nhanh hơn, bấm bên cột trái có chữ "Tải File để thi"</p>
                    </div>
                  </div>

                  {/* Upload area */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2"><Paperclip size={14}/> Nộp bài tự luận</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.pptx" className="hidden"
                      onChange={e => setUploadFile(e.target.files[0])} />

                    {uploadFile ? (
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 mb-3">
                        <span className="text-sm text-blue-700 font-medium truncate">{uploadFile.name}</span>
                        <button onClick={() => setUploadFile(null)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0 text-lg leading-none">×</button>
                      </div>
                    ) : (
                      <div
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`w-full border-2 border-dashed rounded-2xl py-10 cursor-pointer text-center transition-all mb-3 ${
                          isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                        }`}
                      >
                        <Upload size={28} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Kéo thả file vào đây hoặc <span className="text-blue-500 font-semibold hover:underline">click để chọn file</span></p>
                        <p className="text-xs text-gray-400 mt-1">Word, Excel, PowerPoint · Tối đa 50MB</p>
                      </div>
                    )}
                  </div>

                  {/* Submit button */}
                  <button
                    onClick={trySubmitTuLuan}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-100"
                  >
                    <Send size={15}/> NỘP BÀI TỰ LUẬN
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════ FOOTER: Nộp trắc nghiệm ══════════ */}
      {tab === 'trac_nghiem' && !isTracNghiemSubmitted && (
        <div className="px-3 md:px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Đã làm: <span className={`font-bold ${answeredCount === TOTAL ? 'text-green-600' : 'text-orange-500'}`}>{answeredCount}/{TOTAL}</span>
          </span>
          <button
            onClick={trySubmit}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-green-100"
          >
            <CheckCircle size={15}/> NỘP BÀI TRẮC NGHIỆM
          </button>
        </div>
      )}

      {/* ExamMonitor (logic only) */}
      <ExamMonitor ref={monitorRef} isActive={phase === 'test'} onViolate={handleViolation} />

      {/* ══════════ MODALS ══════════ */}
      {showSubmitConfirm && (
        <ConfirmModal
          title="Cảnh báo"
          message={`câu chưa trả lời.\nVẫn quyết định nộp bài?`}
          boldText={`Bạn còn ${unanswered}`}
          confirmLabel="Nộp bài"
          cancelLabel="Làm tiếp"
          onConfirm={() => { setShowSubmitConfirm(false); handleSubmitFinal(); }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}
      {showNoFileConfirm && (
        <ConfirmModal
          title="Cảnh báo thiếu file"
          boldText="Bạn CHƯA CHỌN FILE"
          message="bài làm đính kèm.\nVẫn nộp bài trắng?"
          confirmLabel="Nộp bài"
          cancelLabel="Quay lại chọn"
          onConfirm={() => { setShowNoFileConfirm(false); setUploadDone(true); updateExamProgress({ thucHanh: 'chua_nop', status: 'dat' }); setPhase('result'); }}
          onCancel={() => setShowNoFileConfirm(false)}
        />
      )}
    </div>
  );
};

export default StudentTest;
