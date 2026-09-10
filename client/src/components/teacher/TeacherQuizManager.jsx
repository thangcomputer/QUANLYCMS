import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, Clock, Calendar, Users, Award, BookOpen, CheckCircle,
  X, HelpCircle, Eye, AlertCircle, RefreshCw, Send, Check, Sparkles, Copy
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../utils/toast';
import {
  downloadTeacherQuestionsExcelTemplate,
  parseQuestionBankExcel,
  STUDENT_QUESTIONS_TEMPLATE_HEADERS,
} from '../../utils/studentQuestionsExcel';

const EMPTY_QUESTION = {
  questionText: '',
  options: ['', '', '', ''],
  correctAnswer: 0,
  explanation: '',
};

export default function TeacherQuizManager({
  myStudents = [],
  autoOpenCreate = false,
  createOnly = false,
  presetStudentId = null,
  presetCourseName = '',
  onCreateClose = null,
}) {
  const toast = useToast();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(!createOnly);
  const [showCreateModal, setShowCreateModal] = useState(Boolean(autoOpenCreate));
  const [selectedDetailQuiz, setSelectedDetailQuiz] = useState(null);

  // Form tạo bài trắc nghiệm
  const uniqueCourses = [...new Set((myStudents || []).map(s => s.course).filter(Boolean))];

  const [title, setTitle] = useState('');
  const [courseName, setCourseName] = useState(presetCourseName || uniqueCourses[0] || '');
  const [targetStudentIds, setTargetStudentIds] = useState(
    presetStudentId ? [String(presetStudentId)] : []
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [deadline, setDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiCount, setAiCount] = useState(10);
  const [aiDifficulty, setAiDifficulty] = useState('trung bình');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [promptError, setPromptError] = useState(false);
  const titleInputRef = useRef(null);
  const questionsExcelInputRef = useRef(null);

  const [questions, setQuestions] = useState([]);

  // Load danh sách bài trắc nghiệm của giảng viên
  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const res = await api.quizzes.getTeacherQuizzes();
      if (res.success) {
        setQuizzes(res.data || []);
      }
    } catch {
      toast.error('Lỗi khi tải danh sách bài trắc nghiệm');
    } finally {
      setLoading(false);
    }
  };

  const openTeacherQuizDetailByNotification = useCallback(async (detail = {}) => {
    const quizId = detail?.quizId || detail?.payload?.quizId || null;
    const studentId = detail?.studentId || detail?.payload?.studentId || null;
    if (!quizId && !studentId) return;
    setSelectedDetailQuiz(null);
    setLoading(true);
    try {
      const res = await api.quizzes.getTeacherQuizzes();
      if (!res?.success) {
        toast.error(res?.message || 'Không tải được bài trắc nghiệm');
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      setQuizzes(list);
      const found = quizId
        ? list.find((q) => String(q.id || q._id) === String(quizId))
        : list.find((q) => (q.submissions || []).some((s) => String(s.studentId || s.student_id || s._id) === String(studentId)));
      if (!found) {
        toast.error('Không tìm thấy kết quả bài trắc nghiệm.');
        return;
      }
      setSelectedDetailQuiz(found);
    } catch {
      toast.error('Không tải được kết quả bài trắc nghiệm. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (createOnly) return undefined;
    const onOpen = (e) => {
      const studentId = e?.detail?.studentId || e?.detail?.payload?.studentId;
      // Thông báo nộp bài (có studentId) → overlay xem từng câu; không mở list trắng
      if (studentId) return;
      openTeacherQuizDetailByNotification(e?.detail || {});
    };
    window.addEventListener('open-teacher-quiz-detail', onOpen);
    return () => window.removeEventListener('open-teacher-quiz-detail', onOpen);
  }, [createOnly, openTeacherQuizDetailByNotification]);

  useEffect(() => {
    if (!createOnly) fetchQuizzes();
  }, [createOnly]);

  useEffect(() => {
    if (!autoOpenCreate) return;
    setShowCreateModal(true);
    if (presetCourseName) setCourseName(presetCourseName);
    if (presetStudentId) setTargetStudentIds([String(presetStudentId)]);
  }, [autoOpenCreate, presetCourseName, presetStudentId]);

  const closeCreateModal = () => {
    setShowCreateModal(false);
    onCreateClose?.();
  };

  const studentIdOf = (s) => String(s?._id || s?.id || '');

  const studentDisplayName = (s) => {
    const name = s?.displayName || s?.name || '';
    if (name && !/^\d{5,}$/.test(name)) return name;
    return s?.email || s?.phone || `HV-${studentIdOf(s).slice(-4)}`;
  };

  // Lọc HV theo khóa; cùng 1 HV học nhiều môn thì gộp 1 dòng (tên + các môn)
  const pickerStudents = useMemo(() => {
    const map = new Map();
    (myStudents || []).forEach((s) => {
      if (courseName && s.course !== courseName) return;
      const id = studentIdOf(s);
      if (!id) return;
      const existing = map.get(id);
      const course = String(s.course || '').trim();
      if (!existing) {
        map.set(id, { id, name: studentDisplayName(s), courses: course ? [course] : [] });
        return;
      }
      if (course && !existing.courses.includes(course)) existing.courses.push(course);
    });
    const list = [...map.values()];
    if (!studentSearch.trim()) return list;
    const q = studentSearch.trim().toLowerCase();
    return list.filter((s) => {
      const n = String(s.name || '').toLowerCase();
      const cs = (s.courses || []).join(',').toLowerCase();
      return n.includes(q) || cs.includes(q);
    });
  }, [myStudents, courseName, studentSearch]);

  const toggleTargetStudent = (id) => {
    const sid = String(id);
    setTargetStudentIds((prev) => (
      prev.map(String).includes(sid)
        ? prev.filter((x) => String(x) !== sid)
        : [...prev, sid]
    ));
  };

  const selectAllVisibleStudents = () => {
    setTargetStudentIds(pickerStudents.map((s) => s.id));
  };

  const clearTargetStudents = () => setTargetStudentIds([]);

  // Thêm 1 câu hỏi mới
  const addQuestion = () => {
    setQuestions(prev => [...prev, { ...EMPTY_QUESTION, options: [...EMPTY_QUESTION.options] }]);
  };

  const removeQuestion = (index) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // Thêm mẫu nhanh câu hỏi Word/Excel
  const loadTemplateQuestions = (type) => {
    if (type === 'word') {
      setQuestions([
        {
          questionText: 'Phím tắt nào dùng để sao chép văn bản trong Word?',
          options: ['Ctrl + C', 'Ctrl + V', 'Ctrl + X', 'Ctrl + Z'],
          correctAnswer: 0,
          explanation: 'Ctrl + C là phím tắt sao chép (Copy).',
        },
        {
          questionText: 'Để căn giữa đoạn văn bản, ta dùng tổ hợp phím nào?',
          options: ['Ctrl + E', 'Ctrl + L', 'Ctrl + R', 'Ctrl + J'],
          correctAnswer: 0,
          explanation: 'Ctrl + E dùng để căn giữa (Center align).',
        },
        {
          questionText: 'Định dạng đuôi file mặc định của MS Word từ bản 2007 là gì?',
          options: ['.docx', '.xlsx', '.pptx', '.pdf'],
          correctAnswer: 0,
          explanation: '.docx là định dạng tài liệu mặc định của Word.',
        },
      ]);
    } else if (type === 'excel') {
      setQuestions([
        {
          questionText: 'Hàm nào dùng để tính tổng các ô trong Excel?',
          options: ['SUM', 'AVERAGE', 'COUNT', 'MAX'],
          correctAnswer: 0,
          explanation: 'Hàm SUM dùng để cộng tổng chuỗi số.',
        },
        {
          questionText: 'Cú pháp đúng của hàm VLOOKUP trong Excel là gì?',
          options: [
            'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
            'VLOOKUP(table_array, lookup_value, col_index_num)',
            'VLOOKUP(col_index_num, table_array, lookup_value)',
            'VLOOKUP(range_lookup, table_array, col_index_num)',
          ],
          correctAnswer: 0,
          explanation: 'Đối số 1 là giá trị tìm kiếm, đối số 2 là bảng tra cứu.',
        },
      ]);
    }
    toast.success(`Đã thêm mẫu câu hỏi ${type.toUpperCase()}`);
  };

  const diffLabel = useMemo(() => {
    const d = String(aiDifficulty || '').toLowerCase();
    if (d === 'dễ') return 'Cơ bản';
    if (d === 'khó') return 'Nâng cao';
    return 'Trung bình';
  }, [aiDifficulty]);

  const handleImportQuestionsExcel = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);

      const parsed = await parseQuestionBankExcel(binary, { defaultSection: 'excel' });
      const parsedQs = Array.isArray(parsed?.questions) ? parsed.questions : [];
      const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];

      if (!parsedQs.length) {
        toast.error(errors[0] || 'Không có dữ liệu hợp lệ trong file Excel');
        return;
      }

      const next = parsedQs
        .filter((q) => String(q.type).toLowerCase() === 'multiple')
        .slice(0, 200)
        .map((q) => ({
          questionText: q.q || '',
          options: Array.isArray(q.options) ? q.options.slice(0, 4).map((x) => String(x ?? '')) : ['', '', '', ''],
          correctAnswer: Number(q.correct ?? 0),
          explanation: q.sampleAnswer || '',
        }));

      if (!next.length) {
        toast.error('File không có câu hỏi trắc nghiệm (multiple choice).');
        return;
      }
      setQuestions(next);
      if (errors.length > 0) toast.info(`Lưu ý: ${errors.slice(0, 2).join(' · ')}`);
      toast.success(`Đã nhập ${next.length} câu từ Excel`);
    } catch {
      toast.error('Không đọc được file Excel. Kiểm tra lại định dạng.');
    }
  };

  const handleExportQuestionsExcel = async () => {
    if (!questions.length) {
      toast.error('Chưa có câu hỏi để xuất Excel');
      return;
    }
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const letter = (idx) => ['A', 'B', 'C', 'D'][Math.max(0, Math.min(3, Number(idx) || 0))] || 'A';
      const rows = questions.map((q) => ({
        Loại: 'Trắc nghiệm',
        'Phần thi': courseName || 'Excel',
        'Độ khó': diffLabel,
        'Câu hỏi': q.questionText || '',
        'Đáp án A': q.options?.[0] || '',
        'Đáp án B': q.options?.[1] || '',
        'Đáp án C': q.options?.[2] || '',
        'Đáp án D': q.options?.[3] || '',
        'Đáp án đúng': letter(q.correctAnswer),
        'Gợi ý trả lời (tự luận)': q.explanation || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows, { header: STUDENT_QUESTIONS_TEMPLATE_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cau hoi');
      const safe = String(courseName || 'Quiz').replace(/[^\w\u00C0-\u024F]+/g, '_').slice(0, 30);
      XLSX.writeFile(wb, `Quiz_TracNghiem_${safe}.xlsx`);
      toast.success('Đã xuất file Excel');
    } catch {
      toast.error('Xuất Excel thất bại');
    }
  };

  const handleGenerateAi = async () => {
    const topic = title.trim();
    if (!topic) {
      setPromptError(true);
      toast.warning('Nhập prompt (tên bài kiểm tra) trước khi tạo bằng AI');
      titleInputRef.current?.focus();
      return;
    }
    setPromptError(false);
    setAiGenerating(true);
    try {
      const res = await api.quizzes.generateAi({
        topic,
        courseName,
        count: Number(aiCount) || 10,
        difficulty: aiDifficulty,
      });
      if (!res?.success || !Array.isArray(res.data?.questions) || !res.data.questions.length) {
        toast.error(res?.message || 'AI không tạo được câu hỏi');
        return;
      }
      if (res.data.source === 'fallback') {
        toast.error(res.message || 'AI chưa sẵn sàng — không dùng câu mẫu. Kiểm tra GEMINI_API_KEY trên server.');
        return;
      }
      setQuestions(res.data.questions.map((q) => ({
        questionText: q.questionText || '',
        options: Array.isArray(q.options) && q.options.length >= 4
          ? q.options.slice(0, 4)
          : ['', '', '', ''],
        correctAnswer: Number(q.correctAnswer) || 0,
        explanation: q.explanation || '',
      })));
      toast.success(res.message || `Đã soạn ${res.data.questions.length} câu. Kiểm tra rồi bấm Tạo bài.`);
    } catch (err) {
      toast.error(err?.message || 'Lỗi kết nối khi gọi AI');
    } finally {
      setAiGenerating(false);
    }
  };

  // Submit tạo bài trắc nghiệm
  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.warning('Vui lòng nhập tên bài trắc nghiệm');
    if (questions.length === 0) {
      return toast.warning('Thêm ít nhất 1 câu hỏi trước khi tạo bài');
    }
    if (questions.some(q => !q.questionText.trim() || q.options.some(o => !o.trim()))) {
      return toast.warning('Vui lòng điền đầy đủ câu hỏi và 4 lựa chọn đáp án');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        courseName,
        targetStudentIds,
        timeLimitMinutes: Number(timeLimitMinutes) || 15,
        startTime,
        deadline: deadline || null,
        questions,
      };
      const res = await api.quizzes.create(payload);
      if (res.success) {
        toast.success('Đã tạo bài trắc nghiệm thành công!');
        setShowCreateModal(false);
        setTitle('');
        setTargetStudentIds(presetStudentId ? [String(presetStudentId)] : []);
        setQuestions([]);
        if (!createOnly) fetchQuizzes();
        onCreateClose?.();
      } else {
        toast.error(res.message || 'Lỗi khi tạo bài trắc nghiệm');
      }
    } catch {
      toast.error('Lỗi kết nối khi tạo bài trắc nghiệm');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xóa bài trắc nghiệm
  const handleDeleteQuiz = async (id) => {
    if (!(await window.cmsConfirm('Bạn có chắc chắn muốn xóa bài trắc nghiệm này?'))) return;
    try {
      const res = await api.quizzes.remove(id);
      if (res.success) {
        toast.success('Đã xóa bài trắc nghiệm');
        fetchQuizzes();
      } else {
        toast.error(res.message || 'Không thể xóa');
      }
    } catch {
      toast.error('Lỗi khi xóa bài trắc nghiệm');
    }
  };

  // Tạo lại bài thi
  const handleDuplicateQuiz = (quiz) => {
    setTitle(`${quiz.title} (Bản sao)`);
    setCourseName(quiz.courseName || '');
    setTargetStudentIds(quiz.targetStudentIds || []);
    setTimeLimitMinutes(quiz.timeLimitMinutes || 15);
    setQuestions(quiz.questions || []);
    setShowCreateModal(true);
    toast.success('Đã tải bộ câu hỏi cũ. Bạn có thể sửa và tạo bài mới.');
  };

  return (
    <div className={createOnly ? '' : 'space-y-4 w-full'}>
      {!createOnly && (
      <>
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Award className="text-red-600" size={20} /> Quản lý Trắc nghiệm mỗi buổi học
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Tạo câu hỏi trắc nghiệm, gán cho học viên và chấm điểm tự động theo chuẩn phòng thi chứng chỉ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shrink-0"
        >
          <Plus size={16} /> Tạo bài trắc nghiệm mới
        </button>
      </div>

      {/* ── DANH SÁCH BÀI TRẮC NGHIỆM ĐÃ TẠO ── */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">
          <RefreshCw className="animate-spin mx-auto mb-2 text-red-600" size={24} />
          <p className="text-xs font-bold">Đang tải danh sách bài trắc nghiệm...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
          <BookOpen size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-bold text-slate-600">Chưa có bài trắc nghiệm nào</p>
          <p className="text-xs mt-1">Bấm "Tạo bài trắc nghiệm mới" để soạn bộ câu hỏi cho học viên.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quizzes.map((quiz) => {
            const subCount = quiz.submissions?.length || 0;
            const passedCount = (quiz.submissions || []).filter(s => s.status === 'passed').length;
            const avgScore = subCount > 0
              ? Math.round(quiz.submissions.reduce((acc, curr) => acc + (curr.score || 0), 0) / subCount)
              : 0;

            return (
              <div
                key={quiz._id}
                className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase">
                      {quiz.targetStudentIds?.length
                        ? `${quiz.targetStudentIds.length} học viên`
                        : (quiz.courseName || 'Tất cả lớp')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuiz(quiz._id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Xóa bài thi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug mb-1 line-clamp-2">
                    {quiz.title}
                  </h3>

                  <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500 my-3">
                    <span className="flex items-center gap-1"><Clock size={12} /> {quiz.timeLimitMinutes} phút</span>
                    <span className="flex items-center gap-1"><HelpCircle size={12} /> {quiz.questions?.length || 0} câu hỏi</span>
                    <span className="flex items-center gap-1"><Users size={12} /> {subCount} bài đã nộp</span>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Điểm TB học viên:</span>
                    <span className="font-black text-amber-600">{subCount > 0 ? `${avgScore}%` : 'Chưa có'}</span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDuplicateQuiz(quiz)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    title="Tạo bài mới dựa trên bộ câu hỏi này"
                  >
                    <Copy size={14} /> Tạo lại
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailQuiz(quiz)}
                    className="flex-[1.5] py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Eye size={14} /> Xem kết quả ({subCount})
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* ── MODAL SOẠN BÀI TRẮC NGHIỆM MỚI ── */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white rounded-[1.75rem] max-w-4xl w-full shadow-2xl border border-slate-200/80 max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-red-50/40 px-5 sm:px-7 pt-4 pb-4 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-700 text-white shadow-md shadow-red-200">
                    <Plus size={17} strokeWidth={2.5} />
                  </span>
                  Tạo bài thi trắc nghiệm theo buổi học
                </h3>
                <p className="text-xs text-slate-500 mt-1 ml-10">Soạn nội dung trắc nghiệm và giao cho học viên.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} className="flex-1 min-h-0 flex flex-col text-xs font-semibold">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-5 sm:px-7 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5">
                  <label className="block text-slate-600 mb-1">Tên bài kiểm tra / Buổi học *</label>
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (promptError) setPromptError(false);
                    }}
                    placeholder="Ví dụ: Trắc nghiệm Buổi 1 - MS Word"
                    className={`w-full px-3 py-2.5 rounded-xl border outline-none font-bold ${
                      promptError
                        ? 'border-red-500 ring-2 ring-red-100'
                        : 'border-slate-200 focus:border-red-500'
                    }`}
                    required
                  />
                  {promptError && (
                    <p className="mt-1.5 text-[11px] text-red-600 font-bold">
                      Bắt buộc nhập prompt trước khi tạo bằng AI.
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500 font-medium leading-snug">
                    Tên bài cũng là prompt AI. Viết rõ môn + nội dung, ví dụ: Ribbon Word — tab Trang chủ.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5">
                  <label className="block text-slate-600 mb-1">Giao cho học viên</label>
                  <select
                    value={courseName}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCourseName(next);
                      const allowed = new Set(
                        (myStudents || [])
                          .filter((s) => !next || s.course === next)
                          .map(studentIdOf)
                          .filter(Boolean)
                      );
                      setTargetStudentIds((prev) => prev.filter((id) => allowed.has(String(id))));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-red-500 font-bold bg-white"
                  >
                    <option value="">-- Lọc tất cả môn --</option>
                    {uniqueCourses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80">
                    <div className="px-2.5 pt-2 pb-1 border-b border-slate-200/60">
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Tìm học viên..."
                        className="w-full px-2 py-1.5 rounded-xl border border-slate-200 outline-none focus:border-red-500 font-bold bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50/95 border-b border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold">
                        {targetStudentIds.length > 0
                          ? `Đã chọn ${targetStudentIds.length}/${pickerStudents.length} HV`
                          : `Không chọn = cả lớp đang lọc (${pickerStudents.length} HV)`}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={selectAllVisibleStudents}
                          disabled={pickerStudents.length === 0}
                          className="px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 rounded disabled:opacity-40"
                        >
                          Tất cả
                        </button>
                        <button
                          type="button"
                          onClick={clearTargetStudents}
                          disabled={targetStudentIds.length === 0}
                          className="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded disabled:opacity-40"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>
                    {pickerStudents.length === 0 ? (
                      <p className="px-3 py-3 text-[11px] text-slate-400 font-medium">
                        Chưa có học viên trong bộ lọc này.
                      </p>
                    ) : (
                      <div className="max-h-[6rem] overflow-y-auto py-1">
                        {/* Hiển thị 2 cột để gọn không gian ngang */}
                        <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2">
                          {pickerStudents.map((s) => {
                            const checked = targetStudentIds.map(String).includes(s.id);
                            return (
                              <li key={s.id} className="min-w-0">
                                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-white cursor-pointer rounded-md">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTargetStudent(s.id)}
                                    className="rounded border-slate-300 text-red-600 focus:ring-red-500 shrink-0"
                                  />
                                  <span className="font-bold text-slate-800 truncate">{s.name}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5">
                <div className="min-w-0">
                  <label className="block text-slate-600 mb-1 text-[11px]">Thời gian (phút)</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timeLimitMinutes}
                    onChange={e => setTimeLimitMinutes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-red-500 font-bold"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-slate-600 mb-1 text-[11px]">Hạn chót (tuỳ chọn)</label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-red-500 font-bold"
                  />
                </div>
              </div>

              {/* Nhập / Mẫu / Xuất + AI */}
              <div className="rounded-2xl border border-slate-100 bg-white space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={questionsExcelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      handleImportQuestionsExcel(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => questionsExcelInputRef.current?.click()}
                    className="px-2.5 py-1 bg-white text-slate-800 border border-slate-200 rounded-lg text-[11px] font-bold hover:bg-slate-50 transition"
                  >
                    Nhập câu hỏi
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTeacherQuestionsExcelTemplate('excel', 'Excel', 'multiple')}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition"
                  >
                    Mẫu
                  </button>
                  <button
                    type="button"
                    onClick={handleExportQuestionsExcel}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[11px] font-bold hover:bg-emerald-100 transition"
                  >
                    Xuất
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50/70 p-3.5 shadow-sm">
                  <div>
                    <label className="block text-violet-700 text-[10px] font-black uppercase mb-1">Số câu AI</label>
                    <select
                      value={aiCount}
                      onChange={(e) => setAiCount(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-[11px] font-bold outline-none"
                    >
                      <option value={5}>5 câu</option>
                      <option value={10}>10 câu</option>
                      <option value={15}>15 câu</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-violet-700 text-[10px] font-black uppercase mb-1">Độ khó</label>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-[11px] font-bold outline-none"
                    >
                      <option value="dễ">Dễ</option>
                      <option value="trung bình">Trung bình</option>
                      <option value="khó">Khó</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAi}
                    disabled={aiGenerating}
                    className="ml-auto px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 shadow-md shadow-violet-200 transition-all"
                  >
                    {aiGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {aiGenerating ? 'Đang soạn...' : 'Tạo bằng AI (Gemini)'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  AI chỉ điền câu hỏi vào form. Bạn kiểm tra đáp án rồi mới bấm “Tạo bài trắc nghiệm”.
                </p>
              </div>

              {/* SOẠN CÂU HỎI TRẮC NGHIỆM */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <h4 className="font-black text-slate-800 text-sm">Danh sách câu hỏi ({questions.length} câu)</h4>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-red-600 text-white rounded-xl text-xs font-black flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} /> Thêm câu hỏi
                  </button>
                </div>

                {questions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm font-bold text-slate-600">Chưa có câu hỏi</p>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                      Nhập câu hỏi từ Excel, hoặc dùng AI trước khi tạo bài.
                    </p>
                  </div>
                )}

                {questions.map((q, qIdx) => (
                  <div key={qIdx} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 text-xs">Câu hỏi số {qIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeQuestion(qIdx)}
                        className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center gap-1"
                      >
                        <Trash2 size={13} /> Xóa câu
                      </button>
                    </div>

                    <input
                      value={q.questionText}
                      onChange={e => {
                        const val = e.target.value;
                        setQuestions(prev => prev.map((item, idx) => (idx === qIdx ? { ...item, questionText: val } : item)));
                      }}
                      placeholder="Nhập nội dung câu hỏi..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-red-500 font-bold bg-white"
                      required
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setQuestions(prev => prev.map((item, idx) => (idx === qIdx ? { ...item, correctAnswer: optIdx } : item)));
                            }}
                            className={`w-7 h-7 rounded-lg border text-xs font-bold shrink-0 flex items-center justify-center ${
                              q.correctAnswer === optIdx ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-200'
                            }`}
                            title="Bấm để chọn đáp án đúng"
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </button>
                          <input
                            value={opt}
                            onChange={e => {
                              const val = e.target.value;
                              setQuestions(prev => prev.map((item, idx) => {
                                if (idx !== qIdx) return item;
                                const newOpts = [...item.options];
                                newOpts[optIdx] = val;
                                return { ...item, options: newOpts };
                              }));
                            }}
                            placeholder={`Đáp án ${String.fromCharCode(65 + optIdx)}`}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-red-500 bg-white"
                            required
                          />
                        </div>
                      ))}
                    </div>

                    <input
                      value={q.explanation}
                      onChange={e => {
                        const val = e.target.value;
                        setQuestions(prev => prev.map((item, idx) => (idx === qIdx ? { ...item, explanation: val } : item)));
                      }}
                      placeholder="Lời giải thích (không bắt buộc)..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-red-500 text-[11px] bg-white/70"
                    />
                  </div>
                ))}
              </div>
              </div>

              <div className="flex gap-3 px-5 sm:px-7 py-3.5 border-t border-slate-100 shrink-0 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-black hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl font-black transition shadow-md shadow-red-200"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo bài trắc nghiệm'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL XEM CHI TIẾT KẾT QUẢ HỌC VIÊN ── */}
      {!createOnly && selectedDetailQuiz && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedDetailQuiz.title}</h3>
                <p className="text-xs text-slate-500">Kết quả làm bài của học viên ({selectedDetailQuiz.submissions?.length || 0} bài)</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailQuiz(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {selectedDetailQuiz.submissions && selectedDetailQuiz.submissions.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {selectedDetailQuiz.submissions.map((sub, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{sub.studentName}</p>
                      <p className="text-slate-400 text-[11px]">
                        SĐT: {sub.studentPhone || 'N/A'} · Ngày nộp: {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                      </p>
                      {sub.forfeit && (
                        <p className="text-red-600 text-[11px] font-bold mt-0.5">
                          Rớt do thoát giữa giờ{sub.exitReason ? ` · ${sub.exitReason}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`px-2 py-0.5 rounded-md font-black text-xs ${
                        sub.forfeit || sub.status !== 'passed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {sub.forfeit
                          ? 'RỚT · Thoát'
                          : `${sub.score}% · ${sub.correctCount}/${sub.totalQuestions} câu đúng`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs font-bold text-slate-400">Chưa có học viên nào nộp bài.</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
