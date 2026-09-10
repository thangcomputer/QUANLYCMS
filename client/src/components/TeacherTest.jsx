import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Send, AlertTriangle,
  Upload, Lock, FileText, ClipboardCheck, Camera,
  ChevronRight, ChevronLeft, CheckCircle, User, Clock,
  RefreshCw, Video, Monitor, LayoutGrid, ArrowLeft, Download,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import { EXAM_CAMERA_PERMISSION_LABEL } from '../utils/examUi';
import api, { buildMediaDownloadUrl, resolveMediaUrl } from '../services/api';
import {
  getEssayQuestionFile,
  isStudentEssayQuestion,
  questionMatchesExamSubject,
} from '../utils/htmlContent';
import { getExamSubjectMeta } from '../utils/examSubjects';
import {
  buildGroupedTeacherExamQuestions,
  buildTeacherExamSections,
  getTeacherPracticeFilesBySubject,
  countTeacherQuestionsBySubject,
  getQuestionSubjectId,
  computeTeacherMcExamTotalMinutesBySubjects,
  computeTeacherExamTotalMinutesBySubjects,
  resolveTeacherExamSubjectIds,
  computeTeacherPracticalTotalMinutes,
  buildTeacherExamScheduleBySubject,
} from '../utils/teacherExamQuestions';

const PASS_SCORE = 80;
const PRACTICAL_SESSION_KEY = 'teacher_practical_session';

const PRACTICAL_SUBMIT_STEPS = [
  'Tải về tất cả đề thực hành/tự luận của từng môn',
  'Làm bài trên máy tính theo yêu cầu từng đề',
  'Gom toàn bộ bài làm vào một thư mục, nén thành một file .zip hoặc .rar (WinRAR)',
  'Tải lên duy nhất một file nén — không nộp lẻ từng file',
];

function isPracticalArchiveFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.rar');
}

function buildGradeFromTeacher(teacher, savedQuiz) {
  const correct = savedQuiz?.correctCount ?? teacher?.testMcCorrect;
  const wrong = savedQuiz?.wrongCount ?? teacher?.testMcWrong;
  const mcTotal = savedQuiz?.mcTotal ?? teacher?.testMcTotal;
  const resolvedMc = mcTotal ?? ((correct != null && wrong != null) ? correct + wrong : null);
  return {
    total: savedQuiz?.total ?? teacher?.testScore ?? 0,
    pass: String(teacher?.testStatus || '').toLowerCase() === 'passed',
    correctCount: correct ?? 0,
    wrongCount: wrong ?? (resolvedMc != null && correct != null ? resolvedMc - correct : 0),
    mcTotal: resolvedMc ?? 0,
    needsReviewCount: wrong ?? 0,
    sectionFailures: savedQuiz?.sectionFailures ?? [],
  };
}

/** Đăng xuất sạch phiên server + giữ device id (tránh báo “máy khác” khi vào lại) */
async function logoutToLogin(extra = {}) {
  const deviceId = localStorage.getItem('cms_device_id_v1');
  try { await api.auth.logout(); } catch { /* ignore */ }
  const banError = extra.banError;
  localStorage.clear();
  sessionStorage.clear();
  if (deviceId) localStorage.setItem('cms_device_id_v1', deviceId);
  if (banError) localStorage.setItem('teacher_ban_error', banError);
  window.location.href = '/login';
}

/** Thời gian làm bài (giây): đủ cho toàn bộ câu trong ngân hàng — tối thiểu 10 phút, ~90s/câu, tối đa 2 giờ. */
export function computeTeacherExamTimeLimitSeconds(questionCount) {
  const n = Math.max(0, Number(questionCount) || 0);
  if (n < 1) return 600;
  const perQ = 90;
  const floor = 600;
  const cap = 7200;
  return Math.min(cap, Math.max(floor, n * perQ));
}

/** Logo phòng thi — đồng bộ StudentTest */
function ExamBrandLogo({ resolvedUrl, className }) {
  return (
    <img
      src={resolvedUrl || '/logo-thang-tin-hoc.svg'}
      alt="Logo"
      className={className}
      style={
        resolvedUrl
          ? { objectFit: 'contain' }
          : { filter: 'brightness(0) invert(1)' }
      }
    />
  );
}

// ─── STEPPER COMPONENT ───────────────────────────────────────────────────────
const EvaluationStepper = ({ currentStep = 1, results = {}, practicalSubmitted = false, currentTeacher = null, compact = false }) => {
    const steps = [
        { id: 1, label: 'Thi trắc nghiệm', sub: results.quiz?.passed ? '✓ Hoàn thành' : (currentStep === 1 ? '• Đang thực hiện' : 'Chưa bắt đầu') },
        { id: 2, label: 'Thi thực hành', sub: practicalSubmitted || currentTeacher?.practicalFile ? '✓ Đã nộp' : (results.quiz?.passed ? '• Đang thực hiện' : 'Chờ kết quả') },
        { id: 3, label: 'Admin xét duyệt', sub: practicalSubmitted || currentTeacher?.practicalFile ? '• Đang thực hiện' : 'Chờ kết quả' },
    ];

    const pad = compact ? 'p-2 sm:p-2.5' : 'p-6';
    const mb = compact ? 'mb-0 shrink-0' : 'mb-8';
    const titleMb = compact ? 'mb-1' : 'mb-6';
    const lineTop = compact ? 'top-3.5' : 'top-5';
    const px = compact ? 'px-0.5 sm:px-4' : 'px-4 md:px-12';
    const lineInset = compact ? 'left-8 right-8 sm:left-12 sm:right-12' : 'left-20 right-20';
    const dot = compact ? 'w-8 h-8' : 'w-11 h-11';
    const iconSz = compact ? 14 : 20;
    const labelMt = compact ? 'mt-1' : 'mt-4';

    return (
        <div className={`w-full bg-white rounded-xl sm:rounded-2xl ${pad} shadow-sm border border-slate-100 max-w-4xl mx-auto ${mb}`}>
            <p className={`text-xs sm:text-sm font-black text-gray-400 uppercase tracking-widest text-center ${titleMb}`}>Quy trình đánh giá giảng viên</p>
            <div className={`flex items-center justify-between relative ${px} cms-table-wrap pb-1`}>
                {/* Line Background */}
                <div className={`absolute ${lineTop} ${lineInset} h-0.5 bg-gray-100 -z-0`} />
                
                {steps.map((step, i) => (
                    <div key={step.id} className="relative z-10 flex flex-col items-center group">
                        <div className={`${dot} rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${
                            (i + 1 < currentStep || results.quiz?.passed && i === 0) ? 'bg-green-500 text-white' : 
                            (i + 1 === currentStep) ? 'bg-red-600 text-white scale-110' : 'bg-white border-2 border-slate-200 text-slate-300'
                        }`}>
                            {i + 1 < currentStep || (results.quiz?.passed && i === 0) ? <CheckCircle size={iconSz} /> : 
                             i + 1 === currentStep ? (i === 2 ? <User size={iconSz} /> : <FileText size={iconSz} />) : 
                             (i === 2 ? <User size={iconSz} /> : <FileText size={iconSz} />)}
                        </div>
                        <div className={`${labelMt} text-center max-w-[6.5rem] sm:max-w-none`}>
                            <p className={`${compact ? 'text-sm sm:text-base' : 'text-xs'} font-black uppercase tracking-tight ${i + 1 === currentStep ? 'text-blue-700' : 'text-slate-900'}`}>{step.label}</p>
                            <p className={`${compact ? 'text-xs sm:text-sm' : 'text-xs'} font-bold mt-0.5 ${
                                step.sub.includes('Hoàn thành') ? 'text-green-500' : 
                                step.sub.includes('thực hiện') ? 'text-blue-500 animate-pulse' : 'text-slate-400'
                            }`}>{step.sub}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── MÀN KẾT QUẢ TRẮC NGHIỆM (sau khi nộp bài) ─────────────────────────────
const QuizResultSummary = ({ grade, examSubjectsCatalog, onContinue, onLogin }) => {
  const passed = grade?.pass;
  const correct = grade?.correctCount ?? 0;
  const wrong = grade?.wrongCount ?? 0;
  const mcTotal = grade?.mcTotal ?? (correct + wrong);
  const total = grade?.total ?? 0;
  const sectionFailures = grade?.sectionFailures || [];

  const scoreDetail = mcTotal > 0
    ? `Đúng ${correct}/${mcTotal} câu · Sai ${wrong} câu`
    : 'Chưa có dữ liệu chi tiết từng câu';

  const reviewHint = wrong > 0
    ? (passed
      ? `Còn ${wrong} câu trả lời chưa đúng — nên ôn lại trước khi dạy chính thức.`
      : `Cần chỉnh lại / ôn tập ${wrong} câu trả lời sai.`)
    : null;

  if (!passed) {
    return (
      <div className="flex-1 min-h-0 w-full h-full overflow-y-auto bg-black flex items-center justify-center p-6">
        <div className="bg-white rounded-[40px] p-8 sm:p-10 max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600 animate-in zoom-in duration-300">
          <div className="text-6xl sm:text-7xl mb-3 leading-none select-none" role="img" aria-label="Buồn">😢</div>
          <h2 className="text-2xl sm:text-3xl font-black text-red-600 uppercase italic">CHƯA ĐẠT</h2>

          <div className="relative mx-auto mt-6 mb-2">
            <div className="mx-auto w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-[6px] border-red-600 bg-red-50 shadow-inner">
              <span className="text-5xl sm:text-6xl font-black tracking-tighter text-red-600">{total}</span>
            </div>
            <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-[0.2em] mt-2">Điểm / 100</p>
          </div>

          <div className="bg-red-50 p-5 sm:p-6 rounded-3xl mt-5 border border-red-100">
            <p className="text-red-900 font-bold leading-relaxed text-sm sm:text-base">
              <span className="block mb-2">{scoreDetail}</span>
              {reviewHint && <span className="block mb-2">{reviewHint}</span>}
              {sectionFailures.length > 0 && (
                <span className="block mb-2 text-red-800">
                  Môn chưa đạt 50%:{' '}
                  {sectionFailures.map((s) => {
                    const label = getExamSubjectMeta(s.sectionId, examSubjectsCatalog).label;
                    return `${label} (${s.correct}/${s.total})`;
                  }).join(', ')}
                </span>
              )}
              <span className="mt-2 inline-block">
                Tài khoản đã bị <strong>KHÓA</strong> do kết quả thi <strong>KHÔNG ĐẠT</strong>.
                Vui lòng liên hệ Admin để được thi lại.
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onLogin}
            className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all text-sm sm:text-base"
          >
            ✓ QUAY LẠI ĐĂNG NHẬP
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 max-h-[100dvh] w-full flex-col overflow-hidden bg-black items-center justify-center p-4 sm:p-5">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border-t-[10px] border-green-600">
        <div className="text-5xl sm:text-6xl mb-2 leading-none select-none" role="img" aria-label="Vui">😊</div>
        <h2 className="text-xl sm:text-2xl font-black uppercase italic text-green-600">ĐẠT TRẮC NGHIỆM</h2>

        <div className="relative mx-auto mt-4 mb-1">
          <div className="mx-auto w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center border-[5px] border-green-600 bg-green-50 shadow-inner">
            <span className="text-4xl sm:text-5xl font-black tracking-tighter text-green-600">{total}</span>
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mt-1.5">Điểm / 100</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl mt-4 border bg-green-50 border-green-100 text-left">
          <p className="font-bold leading-snug text-base sm:text-lg text-green-900">
            <span className="block mb-2 font-black">{scoreDetail}</span>
            {reviewHint && <span className="block mb-2 text-sm sm:text-base">{reviewHint}</span>}
            {sectionFailures.length > 0 && (
              <span className="block mb-2 text-sm text-amber-800 sm:text-base">
                Môn chưa đạt 50%:{' '}
                {sectionFailures.map((s) => {
                  const label = getExamSubjectMeta(s.sectionId, examSubjectsCatalog).label;
                  return `${label} (${s.correct}/${s.total})`;
                }).join(', ')}
              </span>
            )}
            <span className="block text-sm sm:text-base">
              Bạn đã vượt qua phần trắc nghiệm (≥ {PASS_SCORE} điểm). Tiếp theo làm phần tự luận.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="w-full mt-5 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all text-base sm:text-lg"
        >
          ✓ TIẾP TỤC PHẦN TỰ LUẬN
        </button>
      </div>
    </div>
  );
};

const TeacherTest = ({ teacherName = 'Giảng Viên', onBack }) => {
  const {
    teachers,
    teacherExamMinutes,
    teacherEssayExamMinutes,
    updateTeacherExamMinutes,
    updateTeacherEssayExamMinutes,
    examSubjectsCatalog,
  } = useData();
  const { showModal } = useModal();
  const [phase, setPhase] = useState('intro'); // intro, test, result, banned
  const [banReason, setBanReason] = useState('');
  const [timeLeft, setTimeLeft] = useState(600);
  const [answers, setAnswers] = useState({});
  const [grade, setGrade] = useState(null);
  const [showQuizSummary, setShowQuizSummary] = useState(false);
  const [practicalSubmitted, setPracticalSubmitted] = useState(false);
  const [practicalStarted, setPracticalStarted] = useState(false);
  const [practicalTimeLeft, setPracticalTimeLeft] = useState(0);
  const [practicalExpired, setPracticalExpired] = useState(false);
  const practicalTimerRef = useRef(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [practicalSubmitting, setPracticalSubmitting] = useState(false);
  const practicalSubmittingRef = useRef(false);
  const fileRef = useRef(null);
  const [tabViolations, setTabViolations] = useState(0);
  const [cameraViolations, setCameraViolations] = useState(0);
  const [warningOverlay, setWarningOverlay] = useState(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const previewRef = useRef(null);
  const previewStreamRef = useRef(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [webLogoUrl, setWebLogoUrl] = useState('');

  const monitorRef = useRef(null);
  const timerRef = useRef(null);
  const handleSubmitRef = useRef(null);
  const lastViolationTime = useRef(0);
  const lastTabViolationAtRef = useRef(0);
  const tabGuardSuspendedUntilRef = useRef(0);
  const tabHiddenTimerRef = useRef(null);

  const suspendTabGuard = useCallback((ms = 6000) => {
    tabGuardSuspendedUntilRef.current = Date.now() + ms;
  }, []);

  const teacherId = (() => { try { return JSON.parse(localStorage.getItem('teacher_user') || '{}').id; } catch { return null; } })();

  const [questions, setQuestions] = useState([]);
  /** Khi DataContext chưa kịp sync, tải thẳng ngân hàng GV từ API */
  const [fetchedQuestionBank, setFetchedQuestionBank] = useState(null);
  const [selfTeacher, setSelfTeacher] = useState(null);
  /** Phút thi từ server — GV không hydrate qua DataContext admin */
  const [remoteExamMinutes, setRemoteExamMinutes] = useState(null);
  const [remoteEssayMinutes, setRemoteEssayMinutes] = useState(null);
  const [hasServerExamMinutes, setHasServerExamMinutes] = useState(false);
  const [hasServerEssayMinutes, setHasServerEssayMinutes] = useState(false);
  const [examConfigReady, setExamConfigReady] = useState(false);
  const [startingExam, setStartingExam] = useState(false);
  const [examAttemptToken, setExamAttemptToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Teacher never consumes the management bank from DataContext.
  const examPool = useMemo(
    () => (Array.isArray(fetchedQuestionBank) ? fetchedQuestionBank : []).filter(Boolean),
    [fetchedQuestionBank],
  );

  const currentTeacher = selfTeacher
    || teachers?.find(t => String(t.id) === String(teacherId) || String(t._id) === String(teacherId));

  const sessionTeacher = useMemo(() => {
    if (!teacherId) return null;
    try {
      const u = JSON.parse(localStorage.getItem('teacher_user') || '{}');
      const uid = u?.id || u?._id;
      if (uid && String(uid) === String(teacherId)) return { ...u, id: uid };
    } catch { /* ignore */ }
    return null;
  }, [teacherId]);

  const profileForSubjects = currentTeacher || sessionTeacher;

  const teacherExamSubjectIds = useMemo(
    () => resolveTeacherExamSubjectIds(profileForSubjects || {}, examSubjectsCatalog),
    [profileForSubjects, examSubjectsCatalog],
  );

  const activeExamMinutes = examConfigReady && hasServerExamMinutes ? remoteExamMinutes : null;
  const activeEssayMinutes = examConfigReady && hasServerEssayMinutes ? remoteEssayMinutes : null;

  const subjectQuestionStats = useMemo(
    () => countTeacherQuestionsBySubject(examPool, teacherExamSubjectIds),
    [examPool, teacherExamSubjectIds],
  );

  const activeExamSubjects = useMemo(
    () => subjectQuestionStats.filter((s) => s.total > 0),
    [subjectQuestionStats],
  );

  const examScheduleBySubject = useMemo(
    () => buildTeacherExamScheduleBySubject(
      examPool,
      teacherExamSubjectIds,
      activeExamMinutes,
      activeEssayMinutes,
      examSubjectsCatalog,
    ),
    [examPool, teacherExamSubjectIds, activeExamMinutes, activeEssayMinutes, examSubjectsCatalog],
  );

  const mcQuestionCount = useMemo(
    () => activeExamSubjects.reduce((n, s) => n + s.mc, 0),
    [activeExamSubjects],
  );
  const essayQuestionCount = useMemo(
    () => activeExamSubjects.reduce((n, s) => n + s.essay, 0),
    [activeExamSubjects],
  );

  const practiceFilesBySubject = useMemo(
    () => getTeacherPracticeFilesBySubject(examPool, teacherExamSubjectIds, examSubjectsCatalog),
    [examPool, teacherExamSubjectIds, examSubjectsCatalog],
  );

  const practicalMinutesConfig = useMemo(
    () => computeTeacherPracticalTotalMinutes(practiceFilesBySubject, activeEssayMinutes, examSubjectsCatalog),
    [practiceFilesBySubject, activeEssayMinutes, examSubjectsCatalog],
  );

  const practicalSubjectsWithFiles = useMemo(
    () => (practiceFilesBySubject || []).filter((g) => g.files?.length > 0),
    [practiceFilesBySubject],
  );

  const filteredPoolForTime = useMemo(() => {
    if (!teacherExamSubjectIds.length) return examPool || [];
    return (examPool || []).filter((q) =>
      teacherExamSubjectIds.some((sid) => questionMatchesExamSubject(q?.section, sid)),
    );
  }, [examPool, teacherExamSubjectIds]);

  const teacherExamQCount = questions.length || filteredPoolForTime.length;
  const examQuestionsForTime = questions.length > 0 ? questions : filteredPoolForTime;
  const configuredMcMinutes = useMemo(() => {
    if (!examConfigReady || !activeExamMinutes) return null;
    return computeTeacherMcExamTotalMinutesBySubjects(
      examQuestionsForTime,
      teacherExamSubjectIds,
      activeExamMinutes,
      examSubjectsCatalog,
    );
  }, [examConfigReady, activeExamMinutes, examQuestionsForTime, teacherExamSubjectIds, examSubjectsCatalog]);
  const resolveTeacherExamTimeSeconds = useCallback((qCount, minutesMap = activeExamMinutes) => {
    if (minutesMap) {
      const mins = computeTeacherMcExamTotalMinutesBySubjects(
        examQuestionsForTime,
        teacherExamSubjectIds,
        minutesMap,
        examSubjectsCatalog,
      );
      if (mins != null && mins > 0) return mins * 60;
    }
    if (configuredMcMinutes != null && configuredMcMinutes > 0) return configuredMcMinutes * 60;
    return computeTeacherExamTimeLimitSeconds(qCount);
  }, [activeExamMinutes, configuredMcMinutes, examQuestionsForTime, teacherExamSubjectIds, examSubjectsCatalog]);

  const teacherExamMinutesDisplay = configuredMcMinutes != null
    ? configuredMcMinutes
    : teacherExamQCount > 0
      ? Math.ceil(computeTeacherExamTimeLimitSeconds(teacherExamQCount) / 60)
      : null;

  const lastTeacherBankKeyRef = useRef('');

  /** Luôn tải phút thi + ngân hàng từ server (GV không qua hydrate admin) */
  const loadTeacherExamConfigFromServer = useCallback(async () => {
    if (!teacherId) return null;
    const res = await api.teachers.startExamAttempt(teacherId);
    if (!res?.success || !res.data) return null;
    const d = res.data;
    const qs = Array.isArray(d.questions) ? d.questions : [];
    setFetchedQuestionBank(qs);
    setExamAttemptToken(String(d.attemptToken || ''));
    if (d.teacherExamMinutes && typeof d.teacherExamMinutes === 'object') {
      setHasServerExamMinutes(true);
      setRemoteExamMinutes(d.teacherExamMinutes);
      updateTeacherExamMinutes(d.teacherExamMinutes);
    } else {
      setHasServerExamMinutes(false);
      setRemoteExamMinutes(null);
    }
    if (d.teacherEssayExamMinutes && typeof d.teacherEssayExamMinutes === 'object') {
      setHasServerEssayMinutes(true);
      setRemoteEssayMinutes(d.teacherEssayExamMinutes);
      updateTeacherEssayExamMinutes(d.teacherEssayExamMinutes);
    } else {
      setHasServerEssayMinutes(false);
      setRemoteEssayMinutes(null);
    }
    setExamConfigReady(true);
    return d;
  }, [teacherId, updateTeacherExamMinutes, updateTeacherEssayExamMinutes]);

  const handleStartMcExam = useCallback(async () => {
    if (!cameraReady || questions.length === 0 || startingExam) return;
    setStartingExam(true);
    try {
      const d = await loadTeacherExamConfigFromServer();
      const mcMap = d?.teacherExamMinutes && typeof d.teacherExamMinutes === 'object'
        ? d.teacherExamMinutes
        : null;
      if (!mcMap) {
        showModal?.({
          title: 'Chưa cấu hình thời gian thi',
          content: 'Admin cần đặt Phút TN/TL trong Ngân hàng câu hỏi GV và bấm Lưu thời gian.',
          type: 'warning',
        });
        return;
      }
      const seconds = resolveTeacherExamTimeSeconds(questions.length, mcMap);
      setTimeLeft(seconds);
      setPhase('test');
      localStorage.setItem('teacher_test_phase', 'test');
    } catch (err) {
      showModal?.({
        title: 'Không thể bắt đầu bài thi',
        content: err?.message || 'Server chưa cấp được lượt thi hợp lệ. Vui lòng thử lại.',
        type: 'error',
      });
    } finally {
      setStartingExam(false);
    }
  }, [
    cameraReady,
    questions.length,
    startingExam,
    loadTeacherExamConfigFromServer,
    resolveTeacherExamTimeSeconds,
    activeExamMinutes,
    showModal,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await loadTeacherExamConfigFromServer();
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [loadTeacherExamConfigFromServer]);

  useEffect(() => {
    if (phase !== 'intro') return;
    loadTeacherExamConfigFromServer().catch(() => {});
  }, [phase, loadTeacherExamConfigFromServer]);

  useEffect(() => {
    if (configuredMcMinutes == null) return;
    if (phase === 'intro' || phase === 'hardware_check') {
      setTimeLeft(configuredMcMinutes * 60);
    }
  }, [configuredMcMinutes, phase]);

  useEffect(() => {
    const origin = import.meta.env.VITE_API_URL || '';
    fetch(`${origin}/api/settings/web`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.logoUrl) {
          const u = res.data.logoUrl;
          setWebLogoUrl(u.startsWith('http') ? u : `${origin}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentQ((c) => Math.max(0, Math.min(c, Math.max(0, questions.length - 1))));
  }, [questions.length]);

  useEffect(() => {
    if (phase === 'test' || phase === 'result' || phase === 'banned') return;
    if (teacherId && !profileForSubjects) return;
    if (teacherId && !teacherExamSubjectIds.length) return;
    const key = examPool?.length
      ? `${teacherExamSubjectIds.join(',')}:${examPool.length}:${examPool.map((q) => q?.id ?? q?._id ?? '').join(',')}`
      : '';
    if (examPool?.length > 0) {
      if (key !== lastTeacherBankKeyRef.current) {
        lastTeacherBankKeyRef.current = key;
        setQuestions(buildGroupedTeacherExamQuestions(examPool, teacherExamSubjectIds));
      }
    } else {
      lastTeacherBankKeyRef.current = '';
      setQuestions([]);
    }
  }, [examPool, phase, teacherId, profileForSubjects, teacherExamSubjectIds]);

  const examSections = useMemo(
    () => buildTeacherExamSections(questions, teacherExamSubjectIds, examSubjectsCatalog),
    [questions, teacherExamSubjectIds, examSubjectsCatalog],
  );

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    api.teachers.getById(teacherId)
      .then((res) => {
        if (!cancelled && res?.success && res.data) {
          setSelfTeacher({ ...res.data, id: res.data._id || res.data.id });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [teacherId]);

  const faceViolationPersistKey = teacherId ? `teacher_face_violations_${teacherId}` : null;
  const practicalFaceViolationPersistKey = teacherId ? `teacher_practical_face_violations_${teacherId}` : null;

  const practicalMonitorActive = phase === 'result'
    && practicalStarted
    && !practicalSubmitted
    && !practicalExpired
    && grade?.pass
    && !showQuizSummary;

  const isMonitoredSession = phase === 'test' || practicalMonitorActive;

  const practicalMonitorActiveRef = useRef(false);
  practicalMonitorActiveRef.current = practicalMonitorActive;

  const handleFaceViolationChange = useCallback(() => {
    // Exam outcome mutations are handled only by dedicated server endpoints.
  }, []);

  const handleViolate = useCallback((reason) => {
    if (timerRef.current) clearInterval(timerRef.current);
    localStorage.removeItem('teacher_test_phase');
    localStorage.removeItem('teacher_test_tabs');
    setBanReason(reason);
    setPhase('banned');
    if (teacherId && examAttemptToken) {
      api.teachers.forfeitExamAttempt(teacherId, {
        attemptToken: examAttemptToken,
        reason,
      }).catch(() => {});
    }
  }, [teacherId, examAttemptToken]);

  // Tự động khôi phục phase nếu đã có kết quả trong DB
  useEffect(() => {
    if (phase === 'test' || !currentTeacher) return;

    const testStatus = String(currentTeacher.testStatus || '').toLowerCase();
    const teacherStatus = String(currentTeacher.status || '').toLowerCase();

    if (testStatus === 'passed') {
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('teacher_quiz_result') || 'null'); } catch { /* ignore */ }
      setGrade(buildGradeFromTeacher(currentTeacher, saved));
      if (currentTeacher.practicalFile) {
        setPracticalSubmitted(true);
        setPracticalStarted(false);
      } else if (String(currentTeacher.practicalStatus || '').toLowerCase() === 'expired') {
        setPracticalExpired(true);
      }
      setPhase('result');
    } else if (teacherStatus === 'locked') {
      // Đang xem màn kết quả điểm — không ghi đè sang "BÀI THI BỊ HỦY"
      if (phase === 'result') return;

      if (testStatus === 'failed') {
        let saved = null;
        try { saved = JSON.parse(sessionStorage.getItem('teacher_quiz_result') || 'null'); } catch { /* ignore */ }
        setGrade(saved || buildGradeFromTeacher(currentTeacher, null));
        setShowQuizSummary(true);
        setPhase('result');
        return;
      }

      setBanReason(
        currentTeacher.lockReason
        || 'Tài khoản đã bị KHÓA do kết quả thi KHÔNG ĐẠT. Vui lòng liên hệ Admin để được thi lại.',
      );
      setPhase('banned');
    }
  }, [currentTeacher, phase]);

  // Kiểm tra trừng phạt khi load lại trang
  useEffect(() => {
    const punished = localStorage.getItem('punish_teacher_exam');
    if (punished === 'true') {
        localStorage.removeItem('punish_teacher_exam');
        setTimeout(() => {
            handleViolate("Hệ thống phát hiện bạn đã cố tình tải lại trang hoặc thoát trình duyệt trong khi đang làm bài. Tài khoản đã bị khóa.");
        }, 1000);
    }
  }, [handleViolate]);

  const triggerAlert = (type, message, count) => {
     const now = Date.now();
     if (now - lastViolationTime.current < 3000) return; // Debounce 3s
     lastViolationTime.current = now;
     setWarningOverlay({ type, message, count });
     
     // Phát tiếng động cảnh báo
     try {
       const ctx = new (window.AudioContext || window.webkitAudioContext)();
       const osc = ctx.createOscillator();
       const gain = ctx.createGain();
       osc.connect(gain);
       gain.connect(ctx.destination);
       gain.gain.value = 0.15;
       osc.frequency.value = 880;
       osc.start();
       osc.stop(ctx.currentTime + 0.2);
       ctx.close().catch(() => {});
     } catch { /* ignore */ }
  };

  const failAndExitRef = useRef();
  const handlePracticalViolateRef = useRef(() => {});

  // Kiểm tra dấu vết tải lại trang từ lần trước
  useEffect(() => {
    const violation = localStorage.getItem('punish_teacher_exam');
    if (violation === 'true') {
      localStorage.removeItem('punish_teacher_exam');
      const reasonTxt = 'tải lại trang (F5) hoặc đóng tab';
      let inPractical = false;
      try {
        const saved = JSON.parse(sessionStorage.getItem(PRACTICAL_SESSION_KEY) || 'null');
        inPractical = Boolean(saved?.startedAt);
      } catch { /* ignore */ }
      if (inPractical) {
        handlePracticalViolateRef.current(
          `HỦY BÀI: Hành vi cố tình ${reasonTxt} khi đang làm phần tự luận!`,
        );
      } else if (failAndExitRef.current) {
        failAndExitRef.current(reasonTxt);
      }
    }
  }, []);

  // ── ANTI-CHEAT: Chống F5 & Nút Back của Browser ──
  useEffect(() => {
    if (!isMonitoredSession) return;

    const confirmExit = (reasonTxt) => {
      showModal({
        title: 'CẢNH BÁO TỪ HỆ THỐNG',
        content: `Nếu bạn ${reasonTxt}, đồng nghĩa với việc HỦY BÀI THI và vô hiệu hóa tài khoản Giảng viên. Bạn có chắc chắn muốn thoát?`,
        type: 'warning',
        confirmText: 'ĐỒNG Ý HỦY BÀI',
        cancelText: 'Làm bài tiếp',
        onConfirm: () => {
          if (failAndExitRef.current) failAndExitRef.current(reasonTxt);
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        confirmExit('tải lại trang hiện tại (F5)');
      }
    };

    // Kỹ thuật ngăn nút Back (Push history forward một lần duy nhất)
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      confirmExit('quay lại trạng thái trước đó');
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Bạn đang trong bài thi. Thoát sẽ bị hủy kết quả và đăng xuất?';
    };

    const handleActualUnload = () => {
      localStorage.setItem('punish_teacher_exam', 'true');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleActualUnload);
    window.addEventListener('unload', handleActualUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleActualUnload);
      window.removeEventListener('unload', handleActualUnload);
    };
  }, [isMonitoredSession, showModal]);

  // Giám sát chuyển tab / rời màn hình (chỉ khi document thật sự ẩn — không dùng blur)
  useEffect(() => {
    if (!isMonitoredSession || banReason) return;

    const registerTabLeave = () => {
      const inPractical = practicalMonitorActiveRef.current;
      if (inPractical) return; // Bỏ qua giám sát chuyển tab khi làm phần tự luận
      if (Date.now() < tabGuardSuspendedUntilRef.current) return;
      const now = Date.now();
      if (now - lastTabViolationAtRef.current < 1200) return;
      lastTabViolationAtRef.current = now;

      setTabViolations((prev) => {
        const n = prev + 1;
        const inPractical = practicalMonitorActiveRef.current;
        if (n >= 2) {
          const msg = inPractical
            ? 'HỦY BÀI: Bạn đã chuyển Tab hoặc thoát màn hình trong phần tự luận!'
            : 'HỦY BÀI: Bạn đã chuyển Tab hoặc thoát màn hình quá nhiều lần!';
          if (inPractical) handlePracticalViolateRef.current(msg);
          else handleViolate(msg);
        } else {
          triggerAlert(
            'tab',
            inPractical ? '🚨 RỜI MÀN HÌNH KHI LÀM TỰ LUẬN!' : '🚨 PHÁT HIỆN THOÁT KHỎI BÀI THI!',
            n,
          );
        }
        return n;
      });
    };

    const onVisibilityChange = () => {
      if (tabHiddenTimerRef.current) {
        clearTimeout(tabHiddenTimerRef.current);
        tabHiddenTimerRef.current = null;
      }
      if (document.visibilityState === 'hidden') {
        tabHiddenTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'hidden') registerTabLeave();
        }, 350);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (tabHiddenTimerRef.current) clearTimeout(tabHiddenTimerRef.current);
    };
  }, [isMonitoredSession, banReason, handleViolate]);

  // 5. YÊU CẦU CAMERA Ở BƯỚC HARDWARE CHECK TRƯỚC KHI VÀO THI
  useEffect(() => {
    if (phase !== 'hardware_check') return;

    let cancelled = false;
    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(s => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        previewStreamRef.current = s;
        if (previewRef.current) {
          previewRef.current.srcObject = s;
          previewRef.current.play().catch(() => {});
        }
        setCameraReady(true);
        setCameraError('');
      })
      .catch(err => {
        if (cancelled) return;
        setCameraReady(false);
        setCameraError(err.message);
      });

    return () => {
      cancelled = true;
      previewStreamRef.current = null;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [phase]);

  useEffect(() => {
    const video = previewRef.current;
    const stream = previewStreamRef.current;
    if (!video || !stream || !cameraReady) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [cameraReady, phase]);

  // Timer trắc nghiệm — hết giờ tự nộp
  useEffect(() => {
    if (phase !== 'test') return undefined;
    timerRef.current = setInterval(() => {
      setTimeLeft((p) => {
        if (p <= 1) {
          clearInterval(timerRef.current);
          // defer submit to avoid setState during render of interval
          queueMicrotask(() => handleSubmitRef.current?.());
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const persistTeacherSession = useCallback((patch) => {
    try {
      const u = JSON.parse(localStorage.getItem('teacher_user') || '{}');
      if (u?.id || u?._id) {
        localStorage.setItem('teacher_user', JSON.stringify({ ...u, ...patch }));
      }
    } catch { /* ignore */ }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!teacherId || !examAttemptToken || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await api.teachers.submitExamAttempt(teacherId, {
        attemptToken: examAttemptToken,
        answers: questions
          .map((question, index) => ({ question, index }))
          .filter(({ question }) => !isStudentEssayQuestion(question))
          .map(({ question, index }) => ({
            questionId: question.id,
            selectedOption: answers[index] ?? null,
          })),
      });
      const result = response?.data;
      if (!result) throw new Error('Server không trả kết quả chấm thi');
      if (timerRef.current) clearInterval(timerRef.current);
      const payload = {
        testScore: result.score,
        testDate: new Date().toISOString(),
        testStatus: result.passed ? 'passed' : 'failed',
        testMcCorrect: result.correctCount,
        testMcWrong: result.wrongCount,
        testMcTotal: result.mcTotal,
        status: result.passed ? 'Pending' : 'Locked',
        lockReason: result.passed ? null : `Thi trượt trắc nghiệm (${result.score}/100)`,
      };
      const gradeResult = {
        ...result,
        total: result.score,
        pass: result.passed,
      };
      setGrade(gradeResult);
      setShowQuizSummary(true);
      setPhase('result');
      localStorage.removeItem('teacher_test_phase');
      persistTeacherSession(payload);
      setSelfTeacher((prev) => (prev || sessionTeacher)
        ? { ...(prev || sessionTeacher), ...payload, id: teacherId }
        : prev);
      try {
        sessionStorage.setItem('teacher_quiz_result', JSON.stringify(gradeResult));
      } catch { /* ignore */ }
    } catch (err) {
      showModal({
        title: 'Chưa nộp được bài',
        content: err?.message || 'Vui lòng kiểm tra kết nối. Câu trả lời của bạn vẫn được giữ.',
        type: 'error',
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [questions, answers, teacherId, examAttemptToken, persistTeacherSession, sessionTeacher, showModal]);

  handleSubmitRef.current = handleSubmit;

  const handlePracticalSubmit = useCallback(async (fileObj) => {
    if (!teacherId || !fileObj || practicalSubmittingRef.current) return;
    if (!practicalStarted || practicalExpired) {
      showModal({
        title: 'Chưa bắt đầu',
        content: 'Bấm "Bắt đầu phần tự luận" trước khi nộp bài.',
        type: 'warning',
      });
      return;
    }
    if (!isPracticalArchiveFile(fileObj)) {
      showModal({
        title: 'Sai định dạng file',
        content: 'Chỉ chấp nhận một file nén .zip hoặc .rar chứa toàn bộ bài làm của bạn.',
        type: 'error',
      });
      return;
    }

    practicalSubmittingRef.current = true;
    setPracticalSubmitting(true);
    try {
      showModal({ title: 'Đang tải file...', content: 'Vui lòng chờ trong giây lát.', type: 'info' });
      const res = await api.teachers.uploadPractical(fileObj);
      if (res.success && res.fileUrl) {
         const fileUrl = (res.fileUrl || '').replace(/^https?:\/\/[^/]+/i, '') || res.fileUrl;
         await api.teachers.submitPractical(teacherId, fileUrl);
         setPracticalSubmitted(true);
         setPracticalStarted(false);
         if (practicalTimerRef.current) clearInterval(practicalTimerRef.current);
         try { sessionStorage.removeItem(PRACTICAL_SESSION_KEY); } catch { /* ignore */ }
         showModal({ title: 'Thành công', content: 'Bài thực hành đã được lưu.', type: 'success' });
      } else {
         showModal({ title: 'Lỗi', content: res.message || 'Lỗi tải file.', type: 'error' });
      }
    } catch (err) {
      showModal({ title: 'Lỗi', content: err.message || 'Lỗi máy chủ khi tải file lên.', type: 'error' });
    } finally {
      practicalSubmittingRef.current = false;
      setPracticalSubmitting(false);
    }
  }, [teacherId, showModal, practicalStarted, practicalExpired]);

  const handlePracticalTimeout = useCallback(async () => {
    if (practicalTimerRef.current) clearInterval(practicalTimerRef.current);
    setPracticalStarted(false);
    setPracticalExpired(true);
    setPracticalTimeLeft(0);
    try { sessionStorage.removeItem(PRACTICAL_SESSION_KEY); } catch { /* ignore */ }
    const reason = 'Hết thời gian nộp bài tự luận/thực hành. Bài thi không đạt.';
    persistTeacherSession({ status: 'Locked', lockReason: reason, practicalStatus: 'expired' });
    setSelfTeacher((prev) => (prev || sessionTeacher)
      ? { ...(prev || sessionTeacher), status: 'Locked', lockReason: reason, practicalStatus: 'expired', id: teacherId }
      : prev);
    if (teacherId) {
      try {
        await api.teachers.forfeitPractical(teacherId, {
          reasonType: 'expired',
          reason,
        });
      } catch { /* ignore */ }
    }
    showModal({
      title: 'Hết giờ nộp bài',
      content: 'Bạn không nộp bài tự luận đúng thời hạn. Tài khoản đã bị khóa — liên hệ Admin để được hỗ trợ.',
      type: 'error',
    });
  }, [teacherId, persistTeacherSession, sessionTeacher, showModal]);

  const handleStartPractical = useCallback(() => {
    const minutes = practicalMinutesConfig ?? 60;
    const totalSeconds = minutes * 60;
    setPracticalTimeLeft(totalSeconds);
    setPracticalStarted(true);
    setPracticalExpired(false);
    setTabViolations(0);
    setWarningOverlay(null);
    lastTabViolationAtRef.current = 0;
    lastViolationTime.current = 0;
    if (practicalFaceViolationPersistKey) {
      try { localStorage.removeItem(practicalFaceViolationPersistKey); } catch { /* ignore */ }
    }
    try {
      sessionStorage.setItem(PRACTICAL_SESSION_KEY, JSON.stringify({
        teacherId,
        startedAt: Date.now(),
        totalSeconds,
      }));
    } catch { /* ignore */ }
  }, [practicalMinutesConfig, teacherId, practicalFaceViolationPersistKey]);

  const handlePracticalViolate = useCallback((reason) => {
    if (practicalTimerRef.current) clearInterval(practicalTimerRef.current);
    setPracticalStarted(false);
    setPracticalExpired(true);
    setPracticalTimeLeft(0);
    try { sessionStorage.removeItem(PRACTICAL_SESSION_KEY); } catch { /* ignore */ }
    localStorage.removeItem('teacher_test_phase');
    setBanReason(reason);
    setPhase('banned');
    const lockReason = reason;
    persistTeacherSession({ status: 'Locked', lockReason, practicalStatus: 'cancelled' });
    setSelfTeacher((prev) => (prev || sessionTeacher)
      ? { ...(prev || sessionTeacher), status: 'Locked', lockReason, practicalStatus: 'cancelled', id: teacherId }
      : prev);
    if (teacherId) {
      api.teachers.forfeitPractical(teacherId, {
        reasonType: 'cancelled',
        reason: lockReason,
      }).catch(() => {});
    }
  }, [teacherId, persistTeacherSession, sessionTeacher]);

  handlePracticalViolateRef.current = handlePracticalViolate;

  failAndExitRef.current = (reasonTxt) => {
    const fullReason = practicalMonitorActiveRef.current
      ? `HỦY BÀI: Hành vi cố tình ${reasonTxt} khi đang làm phần tự luận!`
      : `HỦY BÀI: Hành vi cố tình ${reasonTxt} khi đang thi!`;
    if (practicalMonitorActiveRef.current) {
      handlePracticalViolateRef.current(fullReason);
    } else {
      handleViolate(fullReason);
    }
    setTimeout(() => {
      localStorage.setItem('teacher_ban_error', fullReason);
      localStorage.removeItem('teacher_user');
      localStorage.removeItem('teacher_access_token');
      localStorage.removeItem('teacher_refresh_token');
    }, 500);
  };

  useEffect(() => {
    if (phase !== 'result' || !grade?.pass || practicalSubmitted || practicalExpired) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(PRACTICAL_SESSION_KEY) || 'null'); } catch { /* ignore */ }
    if (!saved?.startedAt || !saved?.totalSeconds) return;
    if (teacherId && saved.teacherId && String(saved.teacherId) !== String(teacherId)) return;
    const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
    const remaining = saved.totalSeconds - elapsed;
    if (remaining <= 0) {
      handlePracticalTimeout();
    } else {
      setPracticalStarted(true);
      setPracticalTimeLeft(remaining);
      setTabViolations(0);
      setWarningOverlay(null);
      lastTabViolationAtRef.current = 0;
    }
  }, [phase, grade?.pass, practicalSubmitted, practicalExpired, teacherId, handlePracticalTimeout]);

  useEffect(() => {
    if (!practicalStarted || practicalSubmitted || practicalExpired || phase !== 'result') return;
    practicalTimerRef.current = setInterval(() => {
      setPracticalTimeLeft((t) => {
        if (t <= 1) {
          handlePracticalTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (practicalTimerRef.current) clearInterval(practicalTimerRef.current);
    };
  }, [practicalStarted, practicalSubmitted, practicalExpired, phase, handlePracticalTimeout]);

  // UI LAYOUTS
  if (phase === 'banned') return (
    <div className="flex-1 min-h-0 w-full h-full overflow-y-auto bg-black flex items-center justify-center p-6">
      <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
        <XCircle size={80} className="text-red-600 mx-auto mb-6" />
        <h2 className="text-3xl font-black text-red-600 uppercase italic">BÀI THI BỊ HỦY</h2>
        <div className="bg-red-50 p-6 rounded-3xl mt-6 border border-red-100">
           <p className="text-red-900 font-bold leading-relaxed">{banReason}</p>
        </div>
        <button type="button" onClick={() => logoutToLogin()} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all">✓ QUAY LẠI ĐĂNG NHẬP</button>
      </div>
    </div>
  );

  if (phase === 'hardware_check') return (
    <div className="flex-1 min-h-0 h-full w-full bg-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-y-auto overscroll-y-contain">
      <div className="absolute inset-0 border-[12px] border-[#203DB5]/30 pointer-events-none rounded-[32px] m-4 animate-pulse" />
      <div className="bg-white rounded-[28px] p-5 sm:p-6 max-w-[320px] sm:max-w-2xl w-full text-center shadow-[0_0_80px_rgba(32,61,181,0.4)] z-10 border-t-[6px] border-[#203DB5] animate-in zoom-in duration-500 my-4">
         <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-5 sm:items-start">
         <div className="min-w-0 sm:text-left">
         <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0">Yêu cầu bật Camera</h2>
         <p className="text-slate-500 font-bold mt-1 mb-3 px-2 sm:px-0 text-xs leading-relaxed">
             Để đảm bảo tính công bằng, bạn <span className="text-[#E13B35]">bắt buộc phải bật camera</span> xuyên suốt quá trình làm bài thi.
         </p>
         </div>
         
         {/* Hướng dẫn Box (Mô phỏng Dialog Chrome) */}
         <div className="relative mb-3 sm:mb-0 sm:row-span-2 sm:col-start-2 sm:row-start-1">
           <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs cms-min-text-xs font-black px-2 py-0.5 rounded-full z-20 shadow-sm animate-bounce">HƯỚNG DẪN</div>
           <div className="border-[1.5px] border-slate-200 rounded-[20px] p-3 relative text-left bg-[#F4F7F6] shadow-inner select-none pointer-events-none">
            <div className="flex items-center justify-between mb-2">
               <div>
                  <p className="font-bold text-slate-700 text-[13px]">{EXAM_CAMERA_PERMISSION_LABEL} muốn</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-semibold"><Camera size={12}/> Sử dụng camera có sẵn (3)</p>
               </div>
               <XCircle size={16} className="text-slate-400" />
            </div>

            {/* Khung Camera Xem trước */}
            <div className="bg-slate-900 rounded-xl h-20 sm:h-auto sm:aspect-video mb-2 relative overflow-hidden flex items-center justify-center border-[3px] border-white shadow-md">
               {cameraReady ? (
                   <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
               ) : (
                   <div className="text-white/50 text-xs flex flex-col items-center gap-2 font-bold">
                      <Camera size={24} className="animate-pulse" />
                      {cameraError ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-red-400 text-xs cms-min-text-xs">{cameraError}</span>
                          <button onClick={() => window.location.reload()} className="px-2 py-0.5 bg-white/20 rounded text-xs cms-min-text-xs hover:bg-white/30">Thử lại</button>
                        </div>
                      ) : 'Đang chờ cấp quyền...'}
                   </div>
               )}
               <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg text-xs text-white flex items-center gap-1 font-bold">
                 <Video size={10} /> Xem trước
               </div>
            </div>

            {/* Fake Dropdown */}
            <div className="border border-slate-200/80 rounded-[10px] px-3 py-1.5 text-xs cms-min-text-xs font-bold text-slate-600 mb-2 flex justify-between bg-white shadow-sm">
               <span>HD WEB CAMERA (0a50:6100)</span>
               <span className="text-slate-400">▼</span>
            </div>

            {/* Fake Buttons Hướng dẫn */}
            <div className="space-y-1.5 relative mt-3">
               {/* Nút số 1 được đóng khung đỏ */}
               <div className="relative">
                  <div className="absolute -left-[5px] -right-[5px] -top-[5px] -bottom-[5px] border-2 border-red-500 rounded-[14px] pointer-events-none" />
                  <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-xs">Cho phép mỗi khi truy cập...</div>
                  {/* SVG Arrow Pointing UP-LEFT */}
                  <svg className="absolute -right-[20px] -bottom-[20px] w-6 h-6 text-red-500 animate-bounce pointer-events-none" 
                       fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M6 6L20 20" />
                     <path d="M6 6v8" />
                     <path d="M6 6h8" />
                  </svg>
               </div>

               <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-xs opacity-40 mix-blend-luminosity">Cho phép lần này</div>
               <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-xs opacity-40 mix-blend-luminosity">Không bao giờ cho phép</div>
            </div>
         </div>
         </div>

         <div className="min-w-0 sm:col-start-1 sm:row-start-2 sm:text-left">
         {/* Trạng thái Sẵn sàng */}
         <div className={`py-2 rounded-[14px] font-black text-xs mb-3 flex items-center justify-center gap-1.5 transition-all duration-300 ${cameraReady ? 'bg-[#E1FDEB] text-[#008945]' : 'bg-slate-100 text-slate-400 opacity-60'}`}>
            <CheckCircle2 size={13} className={cameraReady ? '' : 'grayscale'}/> Camera đã sẵn sàng!
         </div>

         {(examPool?.length || 0) === 0 && (
           <p className="text-xs cms-min-text-xs font-bold text-red-600 mb-2 px-1 leading-relaxed">
             Chưa có câu hỏi trong ngân hàng. Admin cần thêm câu tại mục Ngân hàng câu hỏi (GV).
           </p>
         )}
         {(examPool?.length || 0) > 0 && questions.length === 0 && (
           <p className="text-xs cms-min-text-xs font-bold text-amber-700 mb-2 px-1 leading-relaxed">
             Đang chuẩn bị đề thi từ ngân hàng…
           </p>
         )}

         {/* Nút Vào thi */}
         <button 
             type="button"
             disabled={!cameraReady || questions.length === 0 || startingExam}
             onClick={handleStartMcExam}
             className={`w-full py-2.5 font-black rounded-[14px] transition-all text-xs flex items-center justify-center gap-2 ${
                 cameraReady && questions.length > 0 && !startingExam
                 ? 'bg-[#E13B35] text-white shadow-xl shadow-red-500/30 hover:bg-black hover:scale-[1.02] active:scale-95' 
                 : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-70'
             }`}>
             {startingExam ? 'Đang tải thời gian thi…' : 'TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI'}
         </button>
         </div>
         </div>
      </div>
    </div>
  );

  if (phase === 'intro') return (
    <div className="flex-1 min-h-0 w-full h-full overflow-y-auto bg-slate-50 p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <EvaluationStepper
          currentStep={1}
          practicalSubmitted={practicalSubmitted}
          currentTeacher={currentTeacher}
          compact
        />

        {/* Hero gọn */}
        <div className="rounded-2xl bg-[#203DB5] px-5 py-5 text-white shadow-md sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Đánh giá năng lực giảng viên
              </h1>
              <p className="mt-2 text-base font-medium text-blue-100/90 sm:text-lg">
                Phần 1 trắc nghiệm › Phần 2 tự luận (nếu đạt) › Admin duyệt
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase('hardware_check')}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-black text-[#203DB5] shadow transition hover:bg-blue-50 active:scale-[0.98] sm:text-lg"
            >
              Bắt đầu <ChevronRight size={20} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* Thông tin đề thi */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {/* Chỉ số tổng quan */}
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl bg-slate-50 px-3 py-3 sm:px-4 sm:py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">Câu hỏi</p>
              <p className="mt-1 text-lg font-black text-slate-900 sm:text-xl">
                {mcQuestionCount > 0 ? (
                  <>
                    {mcQuestionCount}
                    <span className="text-sm font-bold text-slate-500 sm:text-base"> TN</span>
                    {essayQuestionCount > 0 && (
                      <span className="text-sm font-bold text-slate-400 sm:text-base"> · {essayQuestionCount} TL</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-slate-400">Chưa có đề</span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-3 sm:px-4 sm:py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600/80 sm:text-xs">Thời gian TN</p>
              <p className="mt-1 text-lg font-black text-amber-900 sm:text-xl">
                {!examConfigReady
                  ? '…'
                  : !hasServerExamMinutes
                    ? '—'
                    : teacherExamMinutesDisplay != null
                      ? `${teacherExamMinutesDisplay} phút`
                      : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-3 sm:px-4 sm:py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600/80 sm:text-xs">Thời gian TL</p>
              <p className="mt-1 text-lg font-black text-violet-900 sm:text-xl">
                {examConfigReady && practicalMinutesConfig != null ? `${practicalMinutesConfig} phút` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-3 sm:px-4 sm:py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600/80 sm:text-xs">Điểm đạt</p>
              <p className="mt-1 text-lg font-black text-emerald-800 sm:text-xl">≥ 80/100</p>
            </div>
          </div>

          {/* Danh sách môn */}
          <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-base font-black text-slate-800 sm:text-lg">Đề theo chuyên môn</h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">
                {activeExamSubjects.length} môn
              </span>
            </div>
            {examScheduleBySubject.length > 0 ? (
              <ul className="space-y-2">
                {examScheduleBySubject.map((row) => (
                  <li
                    key={row.subjectId}
                    className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-base font-black text-slate-900 sm:text-lg">{row.label}</span>
                    <div className="flex flex-wrap gap-2">
                      {row.mc > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-slate-700 ring-1 ring-slate-200/80">
                          <span className="text-amber-600">{row.mc} TN</span>
                          <span className="text-slate-300">·</span>
                          <Clock size={13} className="text-amber-500" />
                          {row.tnMinutes}p
                        </span>
                      )}
                      {row.essay > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-slate-700 ring-1 ring-slate-200/80">
                          <span className="text-violet-600">{row.essay} TL</span>
                          <span className="text-slate-300">·</span>
                          <Clock size={13} className="text-violet-500" />
                          {row.tlMinutes}p
                        </span>
                      ) : (
                        <span className="inline-flex rounded-lg bg-white/60 px-2.5 py-1 text-sm font-medium text-slate-400 ring-1 ring-slate-100">
                          Không TL
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-base font-medium text-slate-500">
                Chưa có câu hỏi — liên hệ Admin.
              </p>
            )}
            <p className="mt-3 text-center text-xs font-medium text-slate-400 sm:text-sm">
              Tự luận mở sau khi đạt trắc nghiệm · mỗi môn có đồng hồ riêng
            </p>
          </div>

          {/* Quy định */}
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
            <h2 className="mb-3 text-base font-black text-slate-800 sm:text-lg">Quy định khi thi</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                  <Camera size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 sm:text-base">Giám sát camera</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    Theo dõi mắt &amp; chuyển động · <span className="font-bold text-red-600">5 lần = hủy bài</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <Monitor size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 sm:text-base">Không rời màn hình</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    Không chuyển tab / thoát toàn màn · <span className="font-bold text-rose-600">2 lần = hủy</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                  <RefreshCw size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 sm:text-base">Không làm mới trang</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    Cấm F5 và DevTools (F12)
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <LayoutGrid size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 sm:text-base">Đề ngẫu nhiên</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    Thứ tự câu hỏi xáo trộn mỗi lần thi
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs font-medium text-slate-400 px-2 sm:text-sm">
          Kết quả thông báo qua Zalo · Liên hệ Admin nếu có sự cố kỹ thuật
        </p>
      </div>
    </div>
  );

  if (phase === 'result') {
    const waitingAdmin = !!(practicalSubmitted || currentTeacher?.practicalFile);

    const correctCount = grade?.correctCount ?? 0;
    const wrongCount = grade?.wrongCount ?? 0;
    const mcTotal = grade?.mcTotal ?? (correctCount + wrongCount);

    if (practicalExpired) {
      return (
        <div className="flex-1 min-h-0 w-full h-full overflow-y-auto bg-black flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <XCircle size={72} className="text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-red-600 uppercase italic">HẾT GIỜ NỘP BÀI</h2>
            <p className="text-red-900 font-bold mt-4 leading-relaxed">
              Bạn không nộp bài tự luận/thực hành đúng thời hạn. Tài khoản đã bị khóa.
            </p>
            <button type="button" onClick={() => logoutToLogin()} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl">
              ✓ QUAY LẠI ĐĂNG NHẬP
            </button>
          </div>
        </div>
      );
    }

    if (grade && showQuizSummary && !waitingAdmin) {
      return (
        <QuizResultSummary
          grade={grade}
          examSubjectsCatalog={examSubjectsCatalog}
          onContinue={() => setShowQuizSummary(false)}
          onLogin={() => {
            try { sessionStorage.removeItem('teacher_quiz_result'); } catch { /* ignore */ }
            logoutToLogin({
              banError: `Tài khoản đã bị KHÓA do kết quả thi KHÔNG ĐẠT (${grade.total}/${PASS_SCORE} điểm). Vui lòng liên hệ Admin để được thi lại.`,
            });
          }}
        />
      );
    }

    return (
    <>
      <ExamMonitor
        ref={monitorRef}
        isActive={practicalMonitorActive}
        onViolate={handlePracticalViolate}
        enableTabGuard={false}
        persistKey={practicalFaceViolationPersistKey}
        initialFaceViolations={0}
      />
    <div className="flex h-full min-h-0 max-h-[100dvh] w-full flex-col overflow-hidden bg-slate-100">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-2 p-2 sm:p-3">
        <EvaluationStepper
          currentStep={waitingAdmin ? 3 : 2}
          results={{ quiz: { passed: grade.pass } }}
          practicalSubmitted={practicalSubmitted}
          currentTeacher={currentTeacher}
          compact
        />

        {grade.pass && (
          <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-[#008945] px-3 py-2 shadow-md sm:gap-3 sm:px-4 sm:py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
              <CheckCircle size={20} strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black uppercase leading-tight text-white sm:text-base">
                Phần 1: Trắc nghiệm — Đạt ✓
              </p>
              <p className="text-xs font-bold text-white/85 sm:text-sm">
                Đúng {correctCount}/{mcTotal || '—'} · Sai {wrongCount} · {grade.total}/100 điểm
              </p>
            </div>
            <span className="shrink-0 text-2xl font-black tabular-nums text-white sm:text-3xl">{grade.total}</span>
          </div>
        )}

        {grade.pass && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {!practicalSubmitted && !currentTeacher?.practicalFile ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-slate-100 px-3 py-2 sm:px-4 sm:py-2.5">
                  <h3 className="text-base font-black uppercase italic leading-tight text-slate-800 sm:text-lg">
                    Phần 2: Tự luận / Thực hành
                  </h3>
                  <p className="mt-0.5 text-sm font-semibold text-slate-500 sm:text-base">
                    {practicalStarted
                      ? 'Tải đề › làm bài › nén ZIP/RAR › nộp trước khi hết giờ'
                      : 'Bấm Bắt đầu để tải đề — đồng hồ chỉ chạy sau khi bạn xác nhận'}
                  </p>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-2.5 sm:p-3">
                  {!practicalStarted ? (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-3.5">
                        <p className="text-base font-black leading-snug text-amber-950 sm:text-lg">
                          Thời gian làm bài: {practicalMinutesConfig ?? 60} phút
                          {practicalSubjectsWithFiles.length > 0 && (
                            <> · {practicalSubjectsWithFiles.length} môn có đề</>
                          )}
                        </p>
                        <p className="text-sm font-bold text-amber-900 sm:text-base">
                          Hết giờ chưa nộp file › bài thi <strong>không đạt</strong>, tài khoản bị khóa.
                          Camera giám sát bật khi bấm Bắt đầu (mắt / nhìn thẳng / chuyển động — tối đa 5 lần cảnh báo).
                        </p>
                        <ol className="min-h-0 flex-1 list-decimal list-inside space-y-1 overflow-hidden text-sm font-semibold leading-snug text-amber-950 sm:text-base">
                          {PRACTICAL_SUBMIT_STEPS.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                      <button
                        type="button"
                        onClick={handleStartPractical}
                        disabled={practicalSubjectsWithFiles.length === 0}
                        className="shrink-0 w-full rounded-xl bg-[#203DB5] py-3.5 text-base font-black text-white shadow-lg hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-lg"
                      >
                        ▶ BẮT ĐẦU PHẦN TỰ LUẬN
                      </button>
                      {practicalSubjectsWithFiles.length === 0 && (
                        <p className="shrink-0 text-center text-sm font-bold text-red-600">Chưa có đề tự luận — liên hệ Admin</p>
                      )}
                      <p className="shrink-0 text-center text-sm font-bold text-slate-500 sm:text-base">
                        Tải đề › làm bài › nén một file ZIP/RAR › tải lên
                      </p>
                    </>
                  ) : (
                    <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 overflow-hidden">
                      <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-1.5 sm:p-2">
                        <CameraHeaderPanel monitorRef={monitorRef} variant="default" />
                      </div>
                      <div className={`flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 ${
                        practicalTimeLeft < 300 ? 'border-red-400 bg-red-50' : 'border-blue-200 bg-blue-50'
                      }`}>
                        <Clock size={18} className={practicalTimeLeft < 300 ? 'text-red-600' : 'text-blue-600'} />
                        <span className={`font-mono text-xl font-black tabular-nums sm:text-2xl ${
                          practicalTimeLeft < 300 ? 'text-red-700' : 'text-blue-900'
                        }`}>
                          {String(Math.floor(practicalTimeLeft / 60)).padStart(2, '0')}:
                          {String(practicalTimeLeft % 60).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-bold uppercase text-slate-500 sm:text-sm">còn lại</span>
                      </div>

                      <div className="min-h-0 overflow-hidden">
                        {practiceFilesBySubject.length > 0 && (
                          <div className="grid h-full max-h-full grid-cols-1 gap-1.5 overflow-hidden sm:grid-cols-2">
                            {practiceFilesBySubject.map((group) => (
                              <div key={group.subjectId} className="rounded-lg border border-blue-100 bg-blue-50/60 p-2 sm:p-2.5">
                                <p className="text-xs font-black uppercase text-blue-900 sm:text-sm">{group.label}</p>
                                {group.files.length > 0 ? group.files.map((f) => (
                                  <a
                                    key={f.fileUrl}
                                    href={buildMediaDownloadUrl(f.fileUrl, f.fileName)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onMouseDown={() => suspendTabGuard(8000)}
                                    className="mt-1 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm font-bold text-blue-800 hover:bg-blue-50"
                                  >
                                    <Download size={14} className="shrink-0" />
                                    <span className="truncate">{f.fileName}</span>
                                  </a>
                                )) : (
                                  <p className="mt-1 text-xs font-bold text-slate-400 sm:text-sm">Không có đề</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <label
                        className={`group relative flex shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 text-center sm:py-3.5 ${
                          practicalSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-300'
                        }`}
                        onMouseDown={() => suspendTabGuard(10000)}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50/50'); }}
                        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/50'); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (practicalSubmittingRef.current) return;
                          e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/50');
                          const file = e.dataTransfer.files?.[0];
                          if (!file) return;
                          if (!isPracticalArchiveFile(file)) {
                            showModal({ title: 'Sai định dạng file', content: 'Vui lòng nén toàn bộ bài làm thành một file .zip hoặc .rar rồi tải lên.', type: 'error' });
                            return;
                          }
                          if (file.size > 50 * 1024 * 1024) {
                            showModal({ title: 'File quá lớn', content: 'Kích thước file vượt quá giới hạn 50MB.', type: 'error' });
                            return;
                          }
                          setUploadFile(file);
                          handlePracticalSubmit(file);
                        }}
                      >
                        <input
                          type="file"
                          disabled={practicalSubmitting}
                          accept=".zip,.rar,application/zip,application/x-rar-compressed,application/vnd.rar"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!isPracticalArchiveFile(file)) {
                              showModal({ title: 'Sai định dạng file', content: 'Vui lòng nén toàn bộ bài làm thành một file .zip hoặc .rar rồi tải lên.', type: 'error' });
                              return;
                            }
                            if (file.size > 50 * 1024 * 1024) {
                              showModal({ title: 'File quá lớn', content: 'Kích thước file vượt quá giới hạn 50MB.', type: 'error' });
                              return;
                            }
                            setUploadFile(file);
                            handlePracticalSubmit(file);
                          }}
                        />
                        <Upload size={22} className="mb-1 text-blue-500" />
                        <p className="text-sm font-black text-slate-700 sm:text-base">
                          {practicalSubmitting ? 'Đang nộp bài…' : 'Tải lên file .zip hoặc .rar'}
                        </p>
                        <p className="text-xs font-bold text-slate-500 sm:text-sm">Một file nén duy nhất · tối đa 50MB</p>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 p-4 sm:p-5">
                <div className="rounded-xl border border-orange-100 bg-[#FFF9E6] p-4 text-center shadow-inner">
                  <div className="flex items-center justify-center gap-2 text-sm font-black uppercase italic text-[#D97706] sm:text-base">
                    <Clock size={18} className="animate-pulse shrink-0" /> Đang chờ xét duyệt hồ sơ
                  </div>
                  <p className="mt-2 text-sm font-bold leading-snug text-[#92400E] sm:text-base">
                    Hồ sơ đã chuyển bộ phận chuyên môn. Kết quả qua <span className="text-[#D97706]">Zalo</span> trong 24h làm việc.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 sm:text-sm">Hỗ trợ gấp:</p>
                  <p className="text-xl font-black text-slate-800 sm:text-2xl">093.5758.462</p>
                </div>
                <button
                  type="button"
                  onClick={() => logoutToLogin()}
                  className="w-full rounded-xl bg-[#203DB5] py-3.5 text-base font-black text-white shadow-lg sm:text-lg"
                >
                  ✓ HOÀN TẤT & ĐĂNG XUẤT
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

      {warningOverlay && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-6">
          <div className="bg-white rounded-[48px] p-10 max-w-sm w-full text-center shadow-[0_0_80px_rgba(220,38,38,0.3)] border border-red-100 animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <AlertTriangle size={48} className="text-red-600 animate-pulse" />
              <div className="absolute inset-0 border-2 border-red-200 rounded-full animate-ping scale-150 opacity-20" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">{warningOverlay.message}</h2>
            <p className="text-slate-500 font-bold mt-4">
              Vui lòng quay lại làm bài. Đây là vi phạm lần{' '}
              <span className="text-red-600">{warningOverlay.count}/2</span>.
            </p>
            <div className="h-4 bg-slate-100 rounded-full mt-8 overflow-hidden border border-slate-200 p-1">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000 ease-in-out"
                style={{ width: `${(warningOverlay.count / 2) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setWarningOverlay(null)}
              className="w-full mt-10 py-5 bg-slate-900 text-white font-black rounded-3xl text-lg hover:bg-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
            >
              QUAY LẠI BÀI THI
            </button>
          </div>
        </div>
      )}
    </>
    );
  }

  const isQDone = (idx) => {
    const qq = questions[idx];
    if (!qq) return false;
    if (qq.type === 'essay') return typeof answers[idx] === 'string' && String(answers[idx]).trim().length > 0;
    return answers[idx] !== undefined;
  };
  const answeredCount = questions.reduce((acc, _, i) => acc + (isQDone(i) ? 1 : 0), 0);
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const qCur = questions[currentQ];
  const TOTAL = questions.length;
  const currentSubjectLabel = qCur
    ? getExamSubjectMeta(getQuestionSubjectId(qCur, teacherExamSubjectIds), examSubjectsCatalog).label
    : '';

  return (
    <div className="relative flex min-h-0 h-full max-h-full w-full flex-1 flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-950">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(at 0% 0%, rgb(224, 231, 255) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgb(254, 226, 226) 0px, transparent 45%),
            radial-gradient(at 50% 100%, rgb(226, 232, 240) 0px, transparent 40%)`,
        }}
      />

      <ExamMonitor
        ref={monitorRef}
        isActive={phase === 'test'}
        onViolate={handleViolate}
        enableTabGuard={false}
        persistKey={faceViolationPersistKey}
        initialFaceViolations={currentTeacher?.faceViolationCount || 0}
        onFaceViolationChange={handleFaceViolationChange}
      />

      <header className="relative z-20 shrink-0 px-2 pt-1 pb-1 pl-12 md:px-3 lg:pl-3">
        <div className="mx-auto flex max-w-[min(100%,90rem)] flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 px-2 py-1.5 shadow-lg md:flex-nowrap md:gap-3 md:px-3 md:py-2">
          <button
            type="button"
            onClick={() => {
              showModal({
                title: 'CẢNH BÁO TỪ HỆ THỐNG',
                content: 'Nếu bạn thoát bây giờ, bài thi sẽ BỊ HỦY và tài khoản có thể bị khóa. Bạn có chắc chắn?',
                type: 'warning',
                confirmText: 'ĐỒNG Ý HỦY BÀI',
                cancelText: 'Làm bài tiếp',
                onConfirm: () => {
                  if (failAndExitRef.current) failAndExitRef.current('thoát phòng thi');
                },
              });
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/15"
          >
            <ArrowLeft size={12} /> Thoát
          </button>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Giám sát
          </span>
          <span className="hidden truncate text-[11px] font-bold text-white/80 sm:inline max-w-[8rem]">{teacherName}</span>
          <span className="hidden text-[11px] text-slate-400 sm:inline">{answeredCount}/{TOTAL} câu</span>

          <div
            className={`mx-auto flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1 ${
              timeLeft < 120 ? 'border-red-500/45 bg-red-950/40' : 'border-white/15 bg-black/30'
            }`}
          >
            <Clock size={12} className={timeLeft < 120 ? 'text-red-300' : 'text-sky-400'} />
            <span className={`font-mono text-lg font-black tabular-nums leading-none md:text-xl ${timeLeft < 120 ? 'text-red-200' : 'text-white'}`}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>

          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all"
                style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
              />
            </div>
            <p className="shrink-0 text-[11px] font-black uppercase tracking-wide text-white/70">
              Kiểm tra năng lực GV
            </p>
          </div>

          <div className="ml-auto w-full min-w-0 max-w-[16rem] sm:w-auto">
            <CameraHeaderPanel monitorRef={monitorRef} variant="default" />
          </div>
        </div>
      </header>

      {/* ─── VIOLATION OVERLAY ─── */}
      {warningOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-6">
           <div className="bg-white rounded-[48px] p-10 max-w-sm w-full text-center shadow-[0_0_80px_rgba(220,38,38,0.3)] border border-red-100 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                 <AlertTriangle size={48} className="text-red-600 animate-pulse" />
                 <div className="absolute inset-0 border-2 border-red-200 rounded-full animate-ping scale-150 opacity-20" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">{warningOverlay.message}</h2>
              <p className="text-slate-500 font-bold mt-4">Vui lòng quay lại làm bài. Đây là vi phạm lần <span className="text-red-600">{warningOverlay.count}/2</span>.</p>
              
              <div className="h-4 bg-slate-100 rounded-full mt-8 overflow-hidden border border-slate-200 p-1">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000 ease-in-out" 
                  style={{ width: `${(warningOverlay.count / 2) * 100}%` }} 
                />
              </div>
              
              <button 
                onClick={() => setWarningOverlay(null)} 
                className="w-full mt-10 py-5 bg-slate-900 text-white font-black rounded-3xl text-lg hover:bg-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
              >
                QUAY LẠI BÀI THI
              </button>
           </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-2 pb-1 pt-1 md:px-3">
        <div className="mx-auto grid min-h-0 w-full max-w-[min(100%,90rem)] flex-1 grid-cols-1 gap-2 overflow-hidden lg:grid-cols-12 lg:gap-3">
          <main className="order-1 flex min-h-0 flex-col lg:order-2 lg:col-span-8 xl:col-span-9">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Câu {TOTAL > 0 ? currentQ + 1 : 0}/{TOTAL}
                  {currentSubjectLabel ? ` · ${currentSubjectLabel}` : ''}
                  {qCur?.type === 'essay' ? ' · Tự luận' : ' · Trắc nghiệm'}
                </p>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-200 sm:w-32">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                    style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
                {qCur ? (
                  <>
                    <div className="shrink-0 pb-2">
                      <div className="flex items-start gap-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                            isQDone(currentQ) ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {currentQ + 1}
                        </div>
                        <h2 className="min-w-0 flex-1 text-sm font-bold leading-snug text-slate-900 sm:text-base">
                          {qCur.q}
                        </h2>
                        {isQDone(currentQ) && <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" />}
                      </div>
                      {qCur.imageUrl && (
                        <img
                          src={resolveMediaUrl(qCur.imageUrl)}
                          alt=""
                          className="mt-2 max-h-40 rounded-lg border border-slate-200 object-contain bg-white"
                        />
                      )}
                    </div>

                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                      {qCur.type === 'essay' ? (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                          <textarea
                            value={answers[currentQ] || ''}
                            onChange={(e) => setAnswers({ ...answers, [currentQ]: e.target.value })}
                            placeholder="Nhập nội dung trả lời..."
                            className="min-h-0 w-full flex-1 resize-none rounded-lg border-2 border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                          />
                          {(() => {
                            const essayFile = getEssayQuestionFile(qCur);
                            if (!essayFile) return null;
                            return (
                              <a
                                href={buildMediaDownloadUrl(essayFile.fileUrl, essayFile.fileName)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-2 py-1.5 hover:bg-blue-100"
                              >
                                <FileText size={14} className="shrink-0 text-blue-600" />
                                <span className="truncate text-xs font-bold text-blue-900">{essayFile.fileName}</span>
                              </a>
                            );
                          })()}
                        </div>
                      ) : (
                        (qCur.options || []).map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setAnswers({ ...answers, [currentQ]: i })}
                            className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
                              answers[currentQ] === i
                                ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-black ${
                                answers[currentQ] === i ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {['A', 'B', 'C', 'D', 'E', 'F'][i] ?? i + 1}
                            </span>
                            <span
                              className={`min-w-0 flex-1 text-sm leading-snug ${
                                answers[currentQ] === i ? 'font-semibold text-indigo-950' : 'font-medium text-slate-700'
                              }`}
                            >
                              {opt}
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="mt-2 flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => setCurrentQ((p) => Math.max(0, p - 1))}
                        disabled={currentQ === 0}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-35"
                      >
                        <ChevronLeft size={16} /> Trước
                      </button>
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {currentQ + 1}/{TOTAL}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentQ((p) => Math.min(TOTAL - 1, p + 1))}
                        disabled={currentQ >= TOTAL - 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-35"
                      >
                        Sau <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm font-bold text-slate-400">Đang tải đề...</div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-100 p-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (answeredCount < TOTAL) {
                      showModal({
                        title: 'Xác nhận nộp bài',
                        content: answeredCount === 0
                          ? `Bạn chưa trả lời câu nào (${answeredCount}/${TOTAL}). Nộp bài vẫn được chấm — điểm có thể bằng 0. Vẫn nộp?`
                          : `Bạn mới hoàn thành ${answeredCount}/${TOTAL} câu. Vẫn nộp bài?`,
                        type: 'question',
                        confirmText: 'Xác nhận nộp',
                        cancelText: 'Làm tiếp',
                        onConfirm: () => { void handleSubmit(); },
                      });
                    } else {
                      showModal({
                        title: 'Xác nhận nộp bài',
                        content: `Bạn đã hoàn thành ${TOTAL}/${TOTAL} câu. Nộp bài ngay?`,
                        type: 'question',
                        confirmText: 'Nộp bài',
                        cancelText: 'Làm tiếp',
                        onConfirm: () => { void handleSubmit(); },
                      });
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 py-2.5 text-sm font-black text-white shadow-md hover:from-red-700 hover:to-red-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={16} />
                  {submitting ? 'ĐANG NỘP BÀI…' : 'NỘP BÀI KIỂM TRA'}
                </button>
              </div>
            </div>
          </main>

          <aside className="order-2 flex max-h-[28vh] min-h-0 flex-col lg:order-1 lg:col-span-4 lg:max-h-none xl:col-span-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2 shadow-md sm:p-2.5">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <LayoutGrid size={14} className="text-indigo-600" />
                  Mục lục
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                  {answeredCount}/{TOTAL}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3">
                {examSections.map((section) => (
                  <div key={section.subjectId}>
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600">
                      {section.label}
                      {section.empty && (
                        <span className="ml-1 normal-case text-amber-600">(chưa có câu)</span>
                      )}
                    </p>
                    {section.empty ? (
                      <p className="text-[10px] font-semibold text-slate-400 py-1">Admin chưa thêm câu cho môn này</p>
                    ) : (
                    <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-6">
                      {section.indices.map((i) => {
                        const done = isQDone(i);
                        const active = i === currentQ;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setCurrentQ(i)}
                            className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-black transition ${
                              active
                                ? 'bg-red-600 text-white shadow-sm ring-1 ring-indigo-300'
                                : done
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
                            }`}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-1.5 text-[10px] font-semibold text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-600" /> Đang xem</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Đã trả lời</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded border border-slate-300 bg-slate-100" /> Chưa làm</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TeacherTest;
