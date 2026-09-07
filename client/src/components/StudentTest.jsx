import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Send, ChevronLeft, ChevronRight,
  Upload, CheckCircle, Download, Paperclip, Monitor, XCircle,
  LayoutGrid, Shield, Clock,
} from 'lucide-react';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import ExamClickOutsideGuard from './exam/ExamClickOutsideGuard';
import { useSocket } from '../context/SocketContext';
import { useData } from '../context/DataContext';
import { getClientEnrollments } from '../utils/enrollments';
import { getExamSubjectMeta, requireWebcamForSubject, canEnterCertificationExam, canStartCertificationSubject } from '../utils/examSubjects';
import { useModal } from '../utils/Modal.jsx';
import NavArrow from './ui/NavArrow';
import { getStudentPracticeFilesForSubject } from '../utils/htmlContent';
import {
  getCertificationAttemptKey,
  loadCertificationAttempt,
  saveCertificationAttempt,
  clearCertificationAttempt,
  bankFingerprint,
} from '../utils/studentCertificationExam';
import { EXAM_CAMERA_PERMISSION_LABEL } from '../utils/examUi';
import {
  getLiveExamAttemptId,
  rememberLiveExamAttempt,
  clearLiveExamAttempt,
  shareExamAttemptStart,
} from '../utils/examLiveSession';
import api, { buildMediaDownloadUrl, resolveMediaUrl } from '../services/api';

const SUBJECT_META = {
  coban:       { label: 'Máy vi tính (Cơ bản)', short: 'Cơ bản',     examFile: 'De_thi_Co_ban.docx', time: 90 * 60 },
  word:        { label: 'Word',       short: 'Word',       examFile: 'De_thi_Word.docx',   time: 90 * 60 },
  excel:       { label: 'Excel',      short: 'Excel',      examFile: 'De_thi_Excel.xlsx',  time: 90 * 60 },
  powerpoint:  { label: 'PowerPoint', short: 'PowerPoint', examFile: 'De_thi_PPT.pptx',   time: 90 * 60 },
  canva:       { label: 'Canva',                  short: 'Canva',      examFile: 'De_thi_Canva.pdf',  time: 90 * 60 },
};

/** Logo từ cấu hình web (đồng bộ sidebar); fallback SVG chỉnh tông cho nền tối */
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

// ─── Confirm Modal ────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, boldText, onConfirm, onCancel, confirmLabel = 'Nộp bài', cancelLabel = 'Làm tiếp' }) => (
  <div data-exam-modal className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
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
  // Socket & Data
  let session = {};
  try {
    session = JSON.parse(localStorage.getItem('student_user') || '{}') || {};
  } catch {
    session = {};
  }
  const STUDENT_ID = session.id || session._id || null;
  const punishKey = STUDENT_ID ? `punish_student_exam:${STUDENT_ID}` : 'punish_student_exam';
  const { students, studentQuestions, studentExamMinutes, studentEssayExamMinutes, studentEssayRequired, studentExamFiles, examWarningSoundUrl = '', updateStudent, addNotification, examSubjectsCatalog, applyStudentExamConfigFromServer } = useData() || {
    students: [],
    studentQuestions: [],
    studentExamMinutes: { coban: 90, word: 90, excel: 90, powerpoint: 90, canva: 90 },
    studentEssayExamMinutes: { coban: 60, word: 60, excel: 60, powerpoint: 60, canva: 60 },
    studentEssayRequired: { coban: true, word: true, excel: true, powerpoint: true, canva: true },
    studentExamFiles: {},
    examWarningSoundUrl: '',
    updateStudent: () => {},
    addNotification: () => {},
    applyStudentExamConfigFromServer: null,
  };

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [fetchedExamBank, setFetchedExamBank] = useState(null);
  const [examAttemptToken, setExamAttemptToken] = useState('');
  const [examAttemptId, setExamAttemptId] = useState('');
  const [examLoadError, setExamLoadError] = useState('');
  const [serverResult, setServerResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const previewRef = useRef(null);

  const meta = useMemo(() => {
    const sub = getExamSubjectMeta(subjectId, examSubjectsCatalog);
    const fallback = SUBJECT_META[subjectId] || SUBJECT_META.word;
    const mins = Number(studentExamMinutes?.[subjectId]);
    const baseMins = Number.isFinite(mins) && mins >= 1 ? mins : (sub.minutes || fallback.time / 60);
    const mcSecs = Math.max(60, Math.min(8 * 3600, Math.round(baseMins * 60)));
    const essayMins = Number(studentEssayExamMinutes?.[subjectId]);
    const baseEssayMins = Number.isFinite(essayMins) && essayMins >= 1 ? essayMins : 60;
    const essaySecs = Math.max(60, Math.min(8 * 3600, Math.round(baseEssayMins * 60)));
    const practiceFiles = getStudentPracticeFilesForSubject(
      Array.isArray(studentQuestions) ? studentQuestions : [],
      subjectId,
      studentExamFiles,
    );
    const primaryPractice = practiceFiles[0];
    const examFileName = primaryPractice?.fileName || fallback.examFile;
    const examFileUrl = primaryPractice?.fileUrl
      ? buildMediaDownloadUrl(primaryPractice.fileUrl, primaryPractice.fileName)
      : '';
    return {
      label: sub.label || fallback.label,
      short: sub.short || fallback.short,
      examFile: examFileName,
      examFileUrl,
      practiceFiles,
      hasPracticeFile: practiceFiles.length > 0,
      essayRequired: studentEssayRequired?.[subjectId] !== false,
      time: mcSecs,
      essayTime: essaySecs,
    };
  }, [subjectId, studentExamMinutes, studentEssayExamMinutes, studentEssayRequired, studentExamFiles, studentQuestions, examSubjectsCatalog]);

  /** Exact answer-free question set issued and shuffled by the server. */
  const rawQuestions = useMemo(() => {
    const raw = Array.isArray(fetchedExamBank) ? fetchedExamBank : [];
    return raw
      .filter((q) => {
        const type = String(q?.type || '').toLowerCase();
        if (['essay', 'tu_luan', 'tuluan'].includes(type)) return false;
        const options = (q.options || []).filter((o) => o && String(o).trim());
        return options.length >= 2;
      })
      .map((q, i) => {
        const options = (q.options || []).filter((o) => o && String(o).trim());
        return {
          id: q.id ?? `sq-${subjectId}-${i}`,
          text: q.q || q.text || q.questionText || '',
          options,
          imageUrl: q.imageUrl || '',
        };
      });
  }, [fetchedExamBank, subjectId]);

  const bankTotal = rawQuestions.length;
  const bankFp = useMemo(() => bankFingerprint(rawQuestions), [rawQuestions]);

  /** Exam instance (shuffled once per attempt). Empty until START. */
  const [questions, setQuestions] = useState([]);
  const [phase, setPhase] = useState('hardware_check'); // hardware_check | test | result | banned
  /** During hardware check use bank size; after start use instance length only. */
  const TOTAL = (phase === 'hardware_check') ? bankTotal : questions.length;

  const { socket } = useSocket() || {};
  const student = students?.find((s) => (
    String(s.id) === String(STUDENT_ID) || String(s._id) === String(STUDENT_ID)
  ));
  const { showModal } = useModal();
  const teacherId = student?.teacherId;
  const enrollments = useMemo(() => getClientEnrollments(student), [student]);
  const requireWebcam = useMemo(
    () => requireWebcamForSubject(
      enrollments,
      subjectId,
      examSubjectsCatalog,
      student?.requireWebcam === true,
    ),
    [enrollments, subjectId, examSubjectsCatalog, student?.requireWebcam],
  );

  const [tab, setTab] = useState('trac_nghiem');
  const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => meta.time);
  const [banReason, setBanReason] = useState('');
  const attemptKey = getCertificationAttemptKey(STUDENT_ID, subjectId);
  const attemptFpRef = useRef('');

  const API_BASE = import.meta.env.VITE_API_URL || '';
  const [webLogoUrl, setWebLogoUrl] = useState('');
  useEffect(() => {
    fetch(`${API_BASE}/api/settings/web`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.logoUrl) {
          const u = res.data.logoUrl;
          setWebLogoUrl(u.startsWith('http') ? u : `${API_BASE}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  // Modals
  const [showSubmitConfirm, setShowSubmitConfirm]   = useState(false);
  const [showNoFileConfirm, setShowNoFileConfirm]   = useState(false);

  useEffect(() => {
    if (phase !== 'test') return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [phase]);

  // Tự luận
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [tuLuanSubmitting, setTuLuanSubmitting] = useState(false);
  const tuLuanSubmittingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const timerRef   = useRef(null);
  const monitorRef = useRef(null);
  const fileRef    = useRef(null);
  const examPhaseRef = useRef('mc');
  const startingExamRef = useRef(false);

  const progressEntry = useMemo(
    () => (student?.examProgress || []).find((s) => String(s.id) === String(subjectId)) || null,
    [student?.examProgress, subjectId],
  );

  const refuseLockedExam = useCallback(() => {
    clearCertificationAttempt(attemptKey);
    startingExamRef.current = false;
    onBack?.();
  }, [attemptKey, onBack]);

  /** Quay lại khi còn ở bước bật camera: trả lượt thi về "chưa thi", không tính rớt. */
  const leaveBeforeStart = useCallback(() => {
    if (STUDENT_ID) {
      clearLiveExamAttempt(STUDENT_ID, subjectId);
      void api.students.abandonExamAttempt(STUDENT_ID, {
        subjectId,
        soft: true,
        reason: 'Thoát ở bước kiểm tra camera',
      }).catch(() => {});
    }
    clearCertificationAttempt(attemptKey);
    onBack?.();
  }, [STUDENT_ID, subjectId, attemptKey, onBack]);

  const examStartAllowed = useMemo(() => {
    if (!student) return null;
    return canStartCertificationSubject({
      student,
      enrollments,
      subjectId,
      catalog: examSubjectsCatalog,
      examProgressEntry: progressEntry,
    });
  }, [student, enrollments, subjectId, examSubjectsCatalog, progressEntry]);

  const beginOrResumeExam = useCallback(() => {
    if (startingExamRef.current) return;
    if (!rawQuestions.length) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(punishKey) === 'true') {
      return; // punish effect sẽ khóa bài
    }
    if (!canEnterCertificationExam(progressEntry)) {
      refuseLockedExam();
      return;
    }
    if (student && examStartAllowed === false) {
      refuseLockedExam();
      return;
    }
    startingExamRef.current = true;
    const saved = loadCertificationAttempt(attemptKey);
    const fingerprint = bankFingerprint(rawQuestions);
    const canResume = saved
      && saved.attemptId === examAttemptId
      && saved.bankFingerprint === fingerprint
      && Array.isArray(saved.answers)
      && saved.answers.length === rawQuestions.length;
    const nextAnswers = canResume ? saved.answers : Array(rawQuestions.length).fill(null);
    const nextCurrent = canResume
      ? Math.min(Math.max(0, Number(saved.currentQ) || 0), rawQuestions.length - 1)
      : 0;
    const nextPhase = serverResult?.passed === true || (canResume && saved.examPhase === 'essay')
      ? 'essay'
      : 'mc';
    setQuestions(rawQuestions.map((question) => ({
      ...question,
      options: [...question.options],
    })));
    setAnswers(nextAnswers);
    setCurrentQ(nextCurrent);
    setIsTracNghiemSubmitted(serverResult?.passed === true || (canResume && Boolean(saved.isTracNghiemSubmitted)));
    setTab(nextPhase === 'essay' ? 'tu_luan' : 'trac_nghiem');
    examPhaseRef.current = nextPhase;
    if (canResume && saved.timeLeft != null && saved.timeLeft > 0) {
      setTimeLeft(saved.timeLeft);
    } else if (nextPhase === 'essay') {
      setTimeLeft(meta.essayTime);
    } else {
      setTimeLeft(meta.time);
    }
    attemptFpRef.current = fingerprint;
    saveCertificationAttempt(attemptKey, {
      attemptId: examAttemptId,
      bankFingerprint: fingerprint,
      answers: nextAnswers,
      currentQ: nextCurrent,
      timeLeft: canResume && saved.timeLeft > 0
        ? saved.timeLeft
        : (nextPhase === 'essay' ? meta.essayTime : meta.time),
      isTracNghiemSubmitted: serverResult?.passed === true || (canResume && Boolean(saved.isTracNghiemSubmitted)),
      tab: nextPhase === 'essay' ? 'tu_luan' : 'trac_nghiem',
      examPhase: nextPhase,
    });
    setPhase('test');
  }, [rawQuestions, attemptKey, examAttemptId, serverResult, meta.time, meta.essayTime, progressEntry, punishKey, refuseLockedExam, student, examStartAllowed]);

  useEffect(() => {
    if (phase !== 'test') startingExamRef.current = false;
  }, [phase]);

  // Reset timer defaults when subject changes (before start)
  useEffect(() => {
    if (phase !== 'hardware_check') return;
    examPhaseRef.current = 'mc';
    setTimeLeft(meta.time);
    setQuestions([]);
    setAnswers([]);
    setCurrentQ(0);
    setIsTracNghiemSubmitted(false);
    setTab('trac_nghiem');
  }, [meta.time, subjectId, phase]);

  // ── BỎ QUA YÊU CẦU CAMERA NẾU ADMIN ĐÃ TẮT (theo khóa của môn thi) ──
  useEffect(() => {
    if (!requireWebcam && phase === 'hardware_check' && bankTotal > 0 && !questionsLoading) {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(punishKey) === 'true') return;
      if (!canEnterCertificationExam(progressEntry)) {
        refuseLockedExam();
        return;
      }
      if (student && examStartAllowed === false) {
        refuseLockedExam();
        return;
      }
      if (student && examStartAllowed !== true) return;
      beginOrResumeExam();
    }
  }, [requireWebcam, phase, bankTotal, questionsLoading, beginOrResumeExam, punishKey, progressEntry, refuseLockedExam, student, examStartAllowed]);

  // Persist attempt while in test (answers / nav / timer) — no reshuffle
  useEffect(() => {
    if (phase !== 'test' || !questions.length) return;
    saveCertificationAttempt(attemptKey, {
      attemptId: examAttemptId,
      bankFingerprint: attemptFpRef.current || bankFp,
      answers,
      currentQ,
      timeLeft,
      isTracNghiemSubmitted,
      tab,
      examPhase: examPhaseRef.current,
    });
  }, [phase, questions, answers, currentQ, timeLeft, isTracNghiemSubmitted, tab, attemptKey, bankFp, examAttemptId]);

  // Clear attempt when exam ends
  useEffect(() => {
    if (phase !== 'result' && phase !== 'banned') return;
    clearCertificationAttempt(attemptKey);
  }, [phase, attemptKey]);

  const updateExamProgress = useCallback(async (changes, { revertOnFail = false } = {}) => {
    if (!student || !updateStudent) {
      return false;
    }
    const id = student._id || student.id;
    const previousProgress = Array.isArray(student.examProgress)
      ? student.examProgress.map((e) => ({ ...e }))
      : [];
    const progress = student.examProgress || [];
    const idx = progress.findIndex((s) => String(s.id) === String(subjectId));
    let newProgress = [...progress];
    if (idx !== -1) {
      newProgress[idx] = { ...newProgress[idx], ...changes };
    } else {
      newProgress.push({ id: subjectId, ...changes });
    }
    // Optimistic UI + API riêng (không ghi examProgress qua PUT generic)
    updateStudent(id, { examProgress: newProgress }, { localOnly: true });
    try {
      const res = await api.students.updateExamProgress(id, { subjectId, changes });
      if (res && res.success === false) throw new Error(res.message || 'exam-progress failed');
      return true;
    } catch (err) {
      console.error('[exam-progress]', err);
      if (revertOnFail) {
        updateStudent(id, { examProgress: previousProgress }, { localOnly: true });
      }
      return false;
    }
  }, [student, updateStudent, subjectId]);

  /** Đồng bộ ngay trạng thái RỚT + khóa vào danh sách môn thi (không chờ socket). */
  const patchLocalProgress = useCallback((extra = {}) => {
    if (!STUDENT_ID || typeof updateStudent !== 'function') return;
    const fallbackLockUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const progress = Array.isArray(student?.examProgress)
      ? student.examProgress.map((e) => ({ ...e }))
      : [];
    const idx = progress.findIndex((s) => String(s.id) === String(subjectId));
    const total = Number(extra.total);
    const score = Number(extra.score);
    const nextEntry = {
      ...(idx >= 0 ? progress[idx] : { id: subjectId }),
      id: subjectId,
      status: extra.status || 'khong_dat',
      lockUntil: extra.lockUntil != null ? Number(extra.lockUntil) : fallbackLockUntil,
      tracNghiem: Number.isFinite(total)
        ? { score: Number.isFinite(score) ? score : 0, total }
        : (idx >= 0 ? progress[idx].tracNghiem : null),
      thucHanh: 'chua_nop',
      attemptStatus: 'forfeited',
    };
    if (idx >= 0) progress[idx] = nextEntry;
    else progress.push(nextEntry);
    updateStudent(STUDENT_ID, { examProgress: progress }, { localOnly: true });
  }, [STUDENT_ID, updateStudent, student, subjectId]);

  // Ref để các effect (mở đề, socket) không phải phụ thuộc dữ liệu học viên
  const patchLocalProgressRef = useRef(patchLocalProgress);
  useEffect(() => { patchLocalProgressRef.current = patchLocalProgress; }, [patchLocalProgress]);

  const applyFailAndLock = useCallback(async () => {
    if (!STUDENT_ID) return false;
    clearCertificationAttempt(attemptKey);
    clearLiveExamAttempt(STUDENT_ID, subjectId);
    if (!examAttemptToken) {
      // Chưa có token (mất phiên) — vẫn phải chốt rớt lượt đang mở.
      try {
        const res = await api.students.abandonExamAttempt(STUDENT_ID, {
          subjectId,
          reason: 'Thoát phòng thi',
        });
        patchLocalProgressRef.current(res?.data || {});
        return res?.success !== false;
      } catch {
        patchLocalProgressRef.current();
        return false;
      }
    }
    try {
      const res = await api.students.forfeitExamAttempt(STUDENT_ID, { attemptToken: examAttemptToken });
      let data = res?.data || {};
      if (String(data.status || '') !== 'khong_dat') {
        // Lượt đã nộp trắc nghiệm (đang làm thực hành) — vẫn phải chốt RỚT
        const fallback = await api.students
          .abandonExamAttempt(STUDENT_ID, { subjectId, reason: 'Vi phạm quy chế thi' })
          .catch(() => null);
        if (fallback?.data) data = fallback.data;
      }
      patchLocalProgressRef.current({
        status: data.status || 'khong_dat',
        lockUntil: data.lockUntil,
        score: data.score,
        total: data.total,
      });
      return res?.success !== false;
    } catch {
      patchLocalProgressRef.current();
      return false;
    }
  }, [STUDENT_ID, examAttemptToken, attemptKey, subjectId]);

  // ── Tải config công khai an toàn + bộ đề chính xác do server cấp ──
  useEffect(() => {
    if (!STUDENT_ID) return undefined;
    let cancelled = false;
    setQuestionsLoading(true);
    setExamLoadError('');
    (async () => {
      try {
        const [configRes, attemptRes] = await Promise.all([
          api.settings.getStudentExamConfig(),
          shareExamAttemptStart(STUDENT_ID, subjectId, () => api.students.startExamAttempt(
            STUDENT_ID,
            subjectId,
            getLiveExamAttemptId(STUDENT_ID, subjectId),
          )),
        ]);
        if (!cancelled && configRes?.success && configRes.data) {
          if (typeof applyStudentExamConfigFromServer === 'function') {
            applyStudentExamConfigFromServer(configRes.data);
          }
        }
        if (attemptRes?.success && attemptRes.data?.attemptId) {
          rememberLiveExamAttempt(STUDENT_ID, subjectId, attemptRes.data.attemptId);
        }
        if (!cancelled && attemptRes?.success && attemptRes.data) {
          setFetchedExamBank(Array.isArray(attemptRes.data.questions) ? attemptRes.data.questions : []);
          setExamAttemptToken(String(attemptRes.data.attemptToken || ''));
          setExamAttemptId(String(attemptRes.data.attemptId || ''));
          if (attemptRes.data.mcSubmitted && attemptRes.data.mcResult) {
            setServerResult(attemptRes.data.mcResult);
          }
        }
      } catch (err) {
        const abandoned = err?.data?.code === 'EXAM_ATTEMPT_ABANDONED';
        if (abandoned) {
          clearCertificationAttempt(attemptKey);
          clearLiveExamAttempt(STUDENT_ID, subjectId);
          patchLocalProgressRef.current();
        }
        if (!cancelled) {
          setFetchedExamBank([]);
          const msg = err?.data?.message || err?.message || 'Vui lòng kiểm tra điều kiện dự thi và thử lại.';
          setExamLoadError(msg);
          // Bài đã bị hủy: đã có màn hình/dòng cảnh báo riêng, không chồng thêm modal
          if (!abandoned) {
            showModal({
              title: 'Không thể mở đề thi',
              content: msg,
              type: 'error',
              confirmText: 'Đóng',
            });
          }
        }
      }
      if (!cancelled) setQuestionsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [STUDENT_ID, subjectId, attemptKey, applyStudentExamConfigFromServer, showModal]);

  // Cập nhật đề khi admin lưu ngân hàng (socket data:refresh)
  useEffect(() => {
    if (!socket) return undefined;
    const refreshBank = async () => {
      try {
        const res = await api.settings.getStudentExamConfig();
        if (!res?.success || !res.data) return;
        if (typeof applyStudentExamConfigFromServer === 'function') {
          applyStudentExamConfigFromServer(res.data);
        }
      } catch { /* ignore */ }
    };
    socket.on('data:refresh', refreshBank);
    return () => { socket.off('data:refresh', refreshBank); };
  }, [socket, applyStudentExamConfigFromServer]);

  // ── YÊU CẦU CAMERA Ở BƯỚC HARDWARE CHECK TRƯỚC KHI VÀO THI ──
  useEffect(() => {
    if (phase !== 'hardware_check') return;
    if (!requireWebcam) return;

    let cancelled = false;
    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(s => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (previewRef.current) previewRef.current.srcObject = s;
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
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [phase, requireWebcam]);

  // ── Timer ──
  const handleSubmitFinalRef = useRef(() => {});
  const handleFinalTuLuanRef = useRef(async () => {});

  useEffect(() => {
    if (phase !== 'test' || TOTAL < 1) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (examPhaseRef.current === 'essay') {
            void handleFinalTuLuanRef.current();
          } else {
            handleSubmitFinalRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, TOTAL]);

  // ── Browser Trap (Chống F5, Ctrl+R, Back) ──
  const failAndExitRef = useRef();
  failAndExitRef.current = () => {
    void applyFailAndLock().then(() => {
      onBack?.();
    });
  };


  useEffect(() => {
    if (phase !== 'test') return;

    const confirmExit = (reasonTxt) => {
      showModal({
        title: 'CẢNH BÁO TỪ HỆ THỐNG',
        content: `Nếu bạn ${reasonTxt}, đồng nghĩa với việc HỦY BÀI THI và bạn sẽ bị đánh rớt môn này bắt buộc. Bạn có chắc chắn muốn thoát?`,
        type: 'warning',
        confirmText: 'ĐỒNG Ý HỦY BÀI',
        cancelText: 'Làm bài tiếp',
        onConfirm: () => {
          if (failAndExitRef.current) failAndExitRef.current();
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        confirmExit('tải lại trang hiện tại (F5)');
      }
    };

    // Chỉ push trạng thái MỘT LẦN duy nhất khi mount Test Phase
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      confirmExit('quay lại trạng thái trước đó');
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Rời khỏi lúc này sẽ mất toàn bộ bài làm. Bạn có chắc không?';
    };

    // Rời trang thật sự (F5 / đóng tab): chốt RỚT ngay trên server, không cho thi tiếp
    const handleActualUnload = () => {
      if (!STUDENT_ID) return;
      localStorage.setItem(punishKey, 'true');
      clearLiveExamAttempt(STUDENT_ID, subjectId);
      api.students.abandonExamAttemptBeacon(
        STUDENT_ID,
        subjectId,
        'Tải lại hoặc đóng trang khi đang thi',
      );
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
  }, [phase, STUDENT_ID, punishKey, subjectId]); // ĐÃ XÓA onBack, updateExamProgress VÀ showModal ĐỂ TRÁNH LẶP VÒNG LẶP PUSH HISTORY

  const handleViolation = useCallback((reason) => {
    clearInterval(timerRef.current);
    setBanReason(reason);
    setPhase('banned');
    void applyFailAndLock();

    // Phát cảnh báo qua socket cho Super/High + admin chi nhánh HV
    if (socket) {
      socket.emit('exam:violation', {
        studentId: STUDENT_ID,
        studentName: session.name || studentName,
        teacherId: teacherId,
        course: meta.label,
        reason: reason
      });
    }
    // 🔔 Thông báo admin (persistent)
    addNotification(null, 'admin', `⚠️ Vi phạm thi cử: ${session.name || studentName} - môn ${meta.label}. Lý do: ${reason}`);
  }, [socket, STUDENT_ID, session.name, studentName, teacherId, meta.label, addNotification, applyFailAndLock]);

  // Kiểm tra dấu vết tải lại trang từ lần trước (theo từng học viên)
  useEffect(() => {
    if (!STUDENT_ID) return;
    const violation = localStorage.getItem(punishKey);
    if (violation === 'true') {
      localStorage.removeItem(punishKey);
      handleViolation('HỦY BÀI: Hành vi cố tình tải lại trang hoặc đóng tab khi đang thi!');
    }
  }, [STUDENT_ID, punishKey, handleViolation]);

  // Lắng nghe lệnh khóa từ Admin/Giảng viên qua Socket (server broadcast)
  useEffect(() => {
    if (!socket) return;
    const onLocked = (data) => {
      if (String(data.studentId) !== String(STUDENT_ID)) return;
      clearInterval(timerRef.current);
      setBanReason(data.reason || 'Bị khóa bởi Giảng viên/Ban quản trị');
      setPhase('banned');
      void applyFailAndLock();
    };
    socket.on('exam:locked', onLocked);
    return () => socket.off('exam:locked', onLocked);
  }, [socket, STUDENT_ID, applyFailAndLock]);

  // Reset bài thi khi camera không phát hiện mặt 5 lần liên tiếp (lần đầu)
  const handleResetExam = useCallback(() => {
    examPhaseRef.current = 'mc';
    setAnswers(Array(TOTAL).fill(null));
    setCurrentQ(0);
    setIsTracNghiemSubmitted(false);
    setTab('trac_nghiem');
    setUploadFile(null);
    setUploadDone(false);
  }, [TOTAL]);

  const handleAnswer = (qi, oi) => {
    const next = [...answers]; next[qi] = oi; setAnswers(next);
  };

  const handleSubmitFinal = useCallback(async () => {
    if (TOTAL < 1 || !STUDENT_ID || !examAttemptToken || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await api.students.submitExamAttempt(STUDENT_ID, {
        attemptToken: examAttemptToken,
        answers: questions.flatMap((question, index) => {
          if (!Array.isArray(question.options) || question.options.length < 2) return [];
          return [{
            questionId: question.id,
            selectedOption: answers[index] ?? null,
          }];
        }),
      });
      const result = response?.data;
      if (!result) throw new Error('Server không trả kết quả chấm thi');

      clearInterval(timerRef.current);
      setServerResult(result);
      setIsTracNghiemSubmitted(true);
      const passedTN = result.passed === true;
      const requiresEssay = result.essayRequired !== false;

      if (!passedTN) {
        clearCertificationAttempt(attemptKey);
        setPhase('result');
        if (!result.idempotent) {
          addNotification(null, 'admin', `❌ Học viên ${studentName} rớt trắc nghiệm môn ${meta.label}: ${result.score}/${result.total} (${result.percentage}%)`);
        }
      } else if (!requiresEssay) {
        clearCertificationAttempt(attemptKey);
        setPhase('result');
        if (!result.idempotent) {
          addNotification(null, 'admin', `✅ Học viên ${studentName} đạt môn ${meta.label} (chỉ trắc nghiệm): ${result.score}/${result.total} (${result.percentage}%).`);
        }
      } else {
        examPhaseRef.current = 'essay';
        setTimeLeft(meta.essayTime);
        setTab('tu_luan');
        if (!result.idempotent) {
          addNotification(null, 'admin', `✅ Học viên ${studentName} đạt trắc nghiệm môn ${meta.label}: ${result.score}/${result.total} (${result.percentage}%). Đang làm phần thực hành.`);
        }
      }
    } catch (err) {
      showModal({
        title: 'Chưa nộp được bài',
        content: err?.message || 'Vui lòng kiểm tra kết nối. Câu trả lời của bạn vẫn được giữ.',
        type: 'error',
        confirmText: 'Đóng',
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    TOTAL,
    STUDENT_ID,
    examAttemptToken,
    questions,
    answers,
    attemptKey,
    addNotification,
    studentName,
    meta.label,
    meta.essayTime,
    showModal,
  ]);
  handleSubmitFinalRef.current = handleSubmitFinal;

  const handleFinalTuLuan = useCallback(async () => {
    if (tuLuanSubmittingRef.current) return;
    tuLuanSubmittingRef.current = true;
    setTuLuanSubmitting(true);
    let essayFileStored = '';
    if (uploadFile) {
      try {
        const res = await api.assignments.uploadFile(uploadFile);
        if (!res?.success || !res.fileUrl) {
          throw new Error(res?.message || 'Tải file lên thất bại');
        }
        const raw = String(res.fileUrl);
        try {
          essayFileStored = raw.startsWith('http') ? new URL(raw).pathname : raw;
        } catch {
          essayFileStored = raw;
        }
      } catch (err) {
        tuLuanSubmittingRef.current = false;
        setTuLuanSubmitting(false);
        showModal({
          title: 'Không tải được bài làm',
          content: err?.message || 'Vui lòng kiểm tra kết nối và định dạng file (tối đa 3MB theo hệ thống).',
          type: 'error',
          confirmText: 'Đóng',
        });
        return;
      }
    }
    clearInterval(timerRef.current);
    if (!serverResult?.passed) {
      tuLuanSubmittingRef.current = false;
      setTuLuanSubmitting(false);
      showModal({
        title: 'Kết quả chưa hợp lệ',
        content: 'Server chưa xác nhận đạt phần trắc nghiệm.',
        type: 'error',
      });
      return;
    }

    const ok = await updateExamProgress({
      thucHanh: essayFileStored ? 'da_nop' : 'chua_nop',
      ...(essayFileStored ? { essayFile: essayFileStored } : {}),
    }, { revertOnFail: true });

    if (!ok) {
      tuLuanSubmittingRef.current = false;
      setTuLuanSubmitting(false);
      showModal({
        title: 'Chưa lưu được bài thực hành',
        content: 'Vui lòng kiểm tra kết nối và thử nộp lại. Kết quả trắc nghiệm vẫn được giữ trên server.',
        type: 'error',
      });
      return;
    }

    clearCertificationAttempt(attemptKey);
    tuLuanSubmittingRef.current = false;
    setTuLuanSubmitting(false);
    setUploadDone(true);
    setPhase('result');
    if (essayFileStored) {
      addNotification(null, 'admin', `📝 Học viên ${session.name || studentName} đã nộp bài thực hành môn ${meta.label}. Vui lòng chấm điểm.`);
    }
  }, [uploadFile, serverResult, updateExamProgress, showModal, addNotification, session.name, studentName, meta.label, attemptKey]);

  handleFinalTuLuanRef.current = handleFinalTuLuan;

  const trySubmit = () => {
    const unanswered = answers.filter(a => a === null).length;
    if (unanswered > 0) setShowSubmitConfirm(true);
    else void handleSubmitFinal();
  };

  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else void handleFinalTuLuan();
  };

  // Drag & drop
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadFile(file);
  };

  const score  = Number(serverResult?.score) || 0;
  const pct    = Number(serverResult?.percentage) || 0;
  const passed = serverResult?.passed === true;
  const mins   = Math.floor(timeLeft / 60);
  const secs   = timeLeft % 60;

  // ══════════════════════════════════════════════════════
  // HARDWARE CHECK (thi chứng nhận)
  // ══════════════════════════════════════════════════════
  const canStartExam = cameraReady && bankTotal > 0 && !questionsLoading;

  if (!STUDENT_ID) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <p className="text-lg font-bold text-slate-900">Phiên đăng nhập không hợp lệ</p>
          <p className="text-sm text-slate-500 mt-2">Vui lòng đăng xuất và đăng nhập lại trước khi làm bài thi.</p>
          <button type="button" onClick={onBack} className="mt-4 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
            Quay lại Phòng thi
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'hardware_check') return (
    <div className="min-h-screen w-full bg-slate-900 flex flex-col p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="w-full flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={leaveBeforeStart}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 text-xs font-bold border border-slate-600"
          >
            <NavArrow size={14} direction="back" />
            Quay lại
          </button>
        )}
      </div>

        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 border-[12px] border-blue-500/30 pointer-events-none rounded-[32px] m-4 animate-pulse" />
          <div className="bg-white rounded-[28px] p-5 sm:p-6 max-w-[320px] sm:max-w-2xl w-full text-center shadow-[0_0_80px_rgba(32,61,181,0.4)] z-10 border-t-[6px] border-blue-600 animate-in zoom-in duration-500 overflow-y-auto max-h-[90vh] no-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-5 sm:items-start">
            <div className="min-w-0 sm:text-left">
             <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0">Yêu cầu bật Camera</h2>
         {questionsLoading && (
           <div className="mb-3 px-2 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold">
             Đang tải đề thi từ hệ thống...
           </div>
         )}
         {!questionsLoading && examLoadError && (
           <div className="mb-3 px-2 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold leading-relaxed">
             {examLoadError}
           </div>
         )}
         {!questionsLoading && !examLoadError && TOTAL === 0 && (
           <div className="mb-3 px-2 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold leading-relaxed">
             Chưa có câu hỏi trắc nghiệm cho môn <span className="text-amber-950">{meta.short}</span> trong ngân hàng. Vui lòng liên hệ Admin.
           </div>
         )}
         <p className="text-slate-500 font-bold mt-1 mb-3 px-2 sm:px-0 text-xs leading-relaxed">
             Để đảm bảo tính công bằng, bạn <span className="text-red-500">bắt buộc phải bật camera</span> xuyên suốt quá trình làm bài thi.
         </p>
            </div>

         {/* Hướng dẫn Box (Mô phỏng Dialog Chrome) */}
         <div className="border-[1.5px] border-slate-200 rounded-[20px] p-3 mb-3 sm:mb-0 relative text-left bg-slate-50 shadow-inner select-none pointer-events-none sm:row-span-2 sm:col-start-2 sm:row-start-1">
            <div className="flex items-center justify-between mb-2">
               <div>
                  <p className="font-bold text-slate-700 text-[13px]">{EXAM_CAMERA_PERMISSION_LABEL} muốn</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-semibold"><Monitor size={12}/> Sử dụng camera có sẵn</p>
               </div>
               <XCircle size={16} className="text-slate-400" />
            </div>

            {/* Khung Camera Xem trước */}
            <div className="bg-slate-900 rounded-xl h-20 sm:h-auto sm:aspect-video mb-2 relative overflow-hidden flex items-center justify-center border-[3px] border-white shadow-md">
               {cameraReady ? (
                   <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
               ) : (
                   <div className="text-white/50 text-xs flex flex-col items-center gap-2 font-bold">
                      <Monitor size={24} className="animate-pulse" />
                      {cameraError ? 'Lỗi Camera: Bị từ chối' : 'Đang chờ cấp quyền...'}
                   </div>
               )}
               <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg text-xs text-white flex items-center gap-1 font-bold">
                 <CheckCircle size={10} /> Xem trước
               </div>
            </div>

            {/* Fake Dropdown */}
            <div className="border border-slate-200/80 rounded-[10px] px-3 py-1.5 text-xs cms-min-text-xs font-bold text-slate-600 mb-2 flex justify-between bg-white shadow-sm">
               <span>HD WEB CAMERA</span>
               <span className="text-slate-400">▼</span>
            </div>

            {/* Fake Buttons Hướng dẫn */}
            <div className="space-y-1.5 relative mt-3">
               {/* Nút số 1 được đóng khung đỏ */}
               <div className="relative">
                  <div className="absolute -left-[5px] -right-[5px] -top-[5px] -bottom-[5px] border-2 border-red-500 rounded-[14px] pointer-events-none" />
                  <div className="bg-green-200/50 text-green-800 text-center py-1.5 rounded-[10px] font-bold text-xs">Cho phép mỗi khi truy cập...</div>
                  {/* SVG Arrow Pointing UP-LEFT */}
                  <svg className="absolute -right-[20px] -bottom-[20px] w-6 h-6 text-red-500 animate-bounce pointer-events-none" 
                       fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M6 6L20 20" />
                     <path d="M6 6v8" />
                     <path d="M6 6h8" />
                  </svg>
               </div>

               <div className="bg-green-100/50 text-green-700 text-center py-1.5 rounded-[10px] font-bold text-xs opacity-40 mix-blend-luminosity">Cho phép lần này</div>
               <div className="bg-green-100/50 text-green-700 text-center py-1.5 rounded-[10px] font-bold text-xs opacity-40 mix-blend-luminosity">Không bao giờ cho phép</div>
            </div>
         </div>

            <div className="min-w-0 sm:col-start-1 sm:row-start-2 sm:text-left">
         {/* Trạng thái Sẵn sàng */}
         <div className={`py-2 rounded-[14px] font-black text-xs mb-3 flex items-center justify-center gap-1.5 transition-all duration-300 ${cameraReady ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400 opacity-60'}`}>
            <CheckCircle size={13} className={cameraReady ? '' : 'grayscale'}/> Camera đã sẵn sàng!
         </div>

         {/* Nút Vào thi */}
         <button 
             type="button"
             disabled={!canStartExam}
             onClick={() => beginOrResumeExam()} 
             className={`w-full py-3 font-black rounded-[14px] transition-all text-xs sm:text-sm flex items-center justify-center gap-2 ${
                 canStartExam
                 ? 'bg-red-500 text-white shadow-xl shadow-red-500/30 hover:bg-red-600 hover:scale-[1.02] active:scale-95' 
                 : 'bg-red-50 text-red-400 border-2 border-red-200 cursor-not-allowed'
             }`}>
             {questionsLoading
               ? 'ĐANG TẢI ĐỀ THI...'
               : canStartExam
                 ? 'TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI'
                 : 'TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI'}
         </button>
         {!canStartExam && cameraReady && !questionsLoading && bankTotal === 0 && (
           <p className="text-[10px] text-amber-700 font-bold mt-2 px-1">Admin cần thêm câu hỏi môn {meta.short} tại Đào tạo HV › Ngân hàng câu hỏi.</p>
         )}
         {!cameraReady && !cameraError && (
           <p className="text-[10px] text-slate-400 font-bold mt-2">Bấm &quot;Cho phép mỗi khi truy cập&quot; để bật camera.</p>
         )}
         <button type="button" onClick={leaveBeforeStart} className="w-full mt-3 py-2 font-bold rounded-[14px] text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1">
           <NavArrow size={14} direction="back" className="text-slate-600" />
           Quay lại
         </button>
            </div>
          </div>
       </div>
      </div>
    </div>
  );;

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
        <ExamBrandLogo resolvedUrl={webLogoUrl} className="h-7 w-auto max-w-[140px] flex-shrink-0" />
        <span className="text-white font-bold text-sm">Kết quả — {meta.label}</span>
      </div>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        {/* Score */}
        <div className={`rounded-2xl p-6 text-center ${passed ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
          <div className="text-5xl mb-3">{passed ? '🏆' : '😔'}</div>
          <h2 className={`text-2xl font-black ${passed ? 'text-green-700' : 'text-red-700'}`}>{passed ? 'ĐÃ ĐẠT!' : 'CHƯA ĐẠT'}</h2>
          <p className="text-4xl font-black mt-1 text-gray-800">{pct}%</p>
          <p className="text-gray-500 text-sm mt-2">
            Đúng <span className="font-bold text-green-700">{score}</span> câu
            <span className="mx-2 text-gray-300">·</span>
            Sai <span className="font-bold text-red-600">{Math.max(0, TOTAL - score)}</span> câu
          </p>
          <p className="text-gray-400 text-xs mt-2">Học viên không xem được đáp án chi tiết.</p>
        </div>

        {/* Nếu đậu trắc nghiệm và còn bắt TL thì hiện upload (fallback UI) */}
        {passed && meta.essayRequired && (
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
                <button
                  type="button"
                  disabled={tuLuanSubmitting}
                  onClick={() => { if (!uploadFile) return; void handleFinalTuLuan(); }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm"
                >
                  {tuLuanSubmitting ? 'Đang tải lên…' : 'Nộp bài tự luận'}
                </button>
              </>
            )}
          </div>
        )}
        {passed && !meta.essayRequired && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center">
            <p className="text-emerald-800 font-bold text-sm">Môn này chỉ yêu cầu trắc nghiệm — bạn đã hoàn thành.</p>
          </div>
        )}
        {/* Nếu rớt: thông báo khóa 7 ngày */}
        {!passed && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold text-sm">⏳ Bạn không đạt phần trắc nghiệm. Bài thi sẽ bị khóa trong 7 ngày trước khi có thể thi lại.</p>
          </div>
        )}
        <button onClick={() => onBack?.()} className="w-full py-3 bg-gray-800 hover:bg-black text-white font-bold rounded-xl inline-flex items-center justify-center gap-1">
          <NavArrow size={16} direction="back" className="text-white" />
          Về Phòng Thi
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // TEST — Main Layout
  // ══════════════════════════════════════════════════════
  if (phase === 'test' && TOTAL < 1) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center border border-gray-100">
          <p className="text-gray-800 font-bold text-sm mb-2">Không có câu hỏi trắc nghiệm cho môn {meta.label}.</p>
          <p className="text-gray-500 text-xs mb-6">Admin cần thêm câu hỏi (phần thi khớp Word/Excel/PowerPoint) vào ngân hàng học viên.</p>
          <button type="button" onClick={() => onBack?.()} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black inline-flex items-center justify-center gap-1">
            <NavArrow size={16} direction="back" className="text-white" />
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const q              = questions[currentQ];
  const answeredCount  = answers.filter(a => a !== null).length;
  const unanswered     = TOTAL - answeredCount;

  return (
    <ExamClickOutsideGuard
      enabled={phase === 'test' && tab !== 'tu_luan'}
      soundUrl={examWarningSoundUrl}
      maxStrikes={1}
      onMaxStrikes={() => handleViolation('Bấm ra ngoài vùng làm bài khi đang thi. Bài thi bị hủy!')}
      className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-slate-100 font-sans text-slate-900"
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(at 0% 0%, rgb(224, 231, 255) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgb(254, 226, 226) 0px, transparent 45%),
            radial-gradient(at 50% 100%, rgb(226, 232, 240) 0px, transparent 40%)`,
        }}
      />

      {/* ══════════ HEADER — 1 hàng: thoát/SBD/giờ | logo | giám sát+camera ══════════ */}
      <header className="relative z-20 shrink-0 px-2 pt-1.5 pb-1.5 md:px-4 md:pt-2 md:pb-2">
        <div className="relative mx-auto max-w-[min(100%,90rem)] rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 shadow-[0_16px_50px_-18px_rgba(15,23,42,0.5)] overflow-hidden md:rounded-2xl">
          <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative grid grid-cols-1 gap-2 p-2.5 sm:p-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-start">
                <button
                  type="button"
                  onClick={() => {
                    showModal({
                      title: 'CẢNH BÁO TỪ HỆ THỐNG',
                      content: 'Nếu bạn quay lại bây giờ, bài thi sẽ lập tức BỊ HỦY và hệ thống sẽ hiển thị RỚT. Bạn có chắc chắn muốn thoát?',
                      type: 'warning',
                      confirmText: 'ĐỒNG Ý HỦY BÀI',
                      cancelText: 'Làm bài tiếp',
                      onConfirm: () => {
                        void applyFailAndLock().then(() => onBack?.());
                      },
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-black/20 backdrop-blur-sm transition hover:bg-white/15"
                >
                  <ArrowLeft size={14} /> Thoát phòng thi
                </button>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 font-mono text-xs text-slate-100 shadow-inner">
                <Shield size={12} className="shrink-0 text-sky-400" />
                <span className="text-slate-400">SBD:</span>
                <span className="font-bold text-white">{studentSbd}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 text-xs text-slate-200 shadow-inner">
                <LayoutGrid size={12} className="shrink-0 text-sky-400" />
                <span className="font-semibold text-white">{TOTAL}</span>
                <span className="text-slate-400">câu TN</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-inner transition-all ${
                  timeLeft < 300
                    ? 'border-red-500/45 bg-red-950/60 text-red-200 animate-pulse'
                    : 'border-white/15 bg-black/35 text-white'
                }`}
              >
                <Clock size={12} className="shrink-0 text-sky-400" />
                <span>{tab === 'tu_luan' ? 'TL' : 'TN'}:</span>
                <span className="font-mono font-black">
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-center gap-3 min-w-0">
              <ExamBrandLogo
                resolvedUrl={webLogoUrl}
                className="h-7 w-auto max-w-[min(100%,150px)] md:h-8"
              />
              <div className="h-7 w-px bg-white/20 hidden sm:block shrink-0" />
              <div className="text-left hidden sm:block min-w-0">
                <h1 className="text-[11px] font-black leading-none text-white uppercase tracking-wider">Ca thi</h1>
                <p className="text-xs font-bold text-indigo-300 mt-1 leading-tight truncate max-w-[14rem]">{meta.label}</p>
              </div>
            </div>

            <div className="flex min-w-0 items-center lg:justify-end">
              <CameraHeaderPanel monitorRef={monitorRef} variant="compact" />
            </div>
          </div>
        </div>
      </header>

      {/* ══════════ MAIN — gói trong 100dvh, không cuộn trang ══════════ */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-1.5 pt-0.5 md:px-6 md:pb-2">
        <div className="mx-auto grid min-h-0 w-full max-w-[min(100%,90rem)] flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12 lg:gap-4 xl:gap-5">
          <main className="order-1 flex min-h-0 flex-col lg:order-2 lg:col-span-8 xl:col-span-9">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
              <div className="flex shrink-0 border-b border-slate-100 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => setTab('trac_nghiem')}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold transition md:py-3 ${
                    tab === 'trac_nghiem'
                      ? 'text-indigo-900'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'trac_nghiem' && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-red-600" />
                  )}
                  Trắc nghiệm
                  {isTracNghiemSubmitted && <CheckCircle size={16} className="text-emerald-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isTracNghiemSubmitted) setTab('tu_luan');
                  }}
                  disabled={!isTracNghiemSubmitted || !meta.essayRequired}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold transition md:py-3 ${
                    !isTracNghiemSubmitted || !meta.essayRequired
                      ? 'cursor-not-allowed text-slate-300'
                      : tab === 'tu_luan'
                        ? 'text-indigo-900'
                        : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'tu_luan' && isTracNghiemSubmitted && meta.essayRequired && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-red-600" />
                  )}
                  Thực hành / Tự luận
                  {!meta.essayRequired
                    ? <span className="text-xs font-semibold text-slate-400">(Không bắt)</span>
                    : !isTracNghiemSubmitted
                      ? <span className="text-xs font-semibold text-slate-400">(Khoá)</span>
                      : null}
                </button>
              </div>
              <div className="h-1 shrink-0 bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
              {tab === 'trac_nghiem' && (
                <div className="flex h-full min-h-0 flex-col p-2.5 md:p-3 lg:p-4">
                  <div className="shrink-0 border-b border-slate-100 pb-2 md:pb-2.5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 md:text-xs">
                      Câu hỏi {currentQ + 1} / {TOTAL}
                    </p>
                    <h2 className="mt-1 text-sm font-bold leading-snug text-slate-900 md:text-base lg:text-lg">
                      {q.text}
                    </h2>
                    {q.imageUrl && (
                      <img
                        src={resolveMediaUrl(q.imageUrl)}
                        alt=""
                        className="mt-2 max-h-56 w-full rounded-xl border border-slate-200 object-contain bg-white"
                      />
                    )}
                    <p className="mt-1 text-xs font-medium text-slate-500 md:text-xs">
                      Chọn một đáp án · Có thể sửa trước khi nộp
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-1 pr-0.5 md:space-y-1.5 md:py-1.5">
                    {q.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (!isTracNghiemSubmitted) handleAnswer(currentQ, i);
                        }}
                        disabled={isTracNghiemSubmitted}
                        className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all md:gap-2.5 md:px-3 md:py-2 ${
                          answers[currentQ] === i
                            ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-500/10'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        } ${isTracNghiemSubmitted ? 'cursor-not-allowed opacity-65' : ''}`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-black md:h-8 md:w-8 md:text-xs ${
                            answers[currentQ] === i
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                          }`}
                        >
                          {['A', 'B', 'C', 'D', 'E', 'F'][i] ?? i + 1}
                        </span>
                        <span
                          className={`min-w-0 flex-1 text-[13px] leading-snug md:text-sm ${
                            answers[currentQ] === i ? 'font-semibold text-indigo-950' : 'font-medium text-slate-700'
                          }`}
                        >
                          {opt}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-2 md:pt-2.5">
                    <button
                      type="button"
                      onClick={() => setCurrentQ((p) => Math.max(0, p - 1))}
                      disabled={currentQ === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 md:px-3.5 md:py-2.5 md:text-sm"
                    >
                      <ChevronLeft size={18} /> Câu trước
                    </button>
                    <span className="font-mono text-xs font-semibold text-slate-500 md:text-sm">
                      {currentQ + 1} / {TOTAL}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentQ((p) => Math.min(TOTAL - 1, p + 1))}
                      disabled={currentQ === TOTAL - 1}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 md:px-3.5 md:py-2.5 md:text-sm"
                    >
                      Câu sau <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}

              {tab === 'tu_luan' && (
                <div className="p-4 md:p-6 lg:p-7">
                  {uploadDone ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                        <CheckCircle size={36} />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Đã nộp bài thực hành</h3>
                      <p className="mt-2 text-sm text-slate-500">Hồ sơ đã được ghi nhận trên hệ thống.</p>
                      <button
                        type="button"
                        onClick={() => onBack?.()}
                        className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        Về phòng thi
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 md:flex md:gap-6">
                        <div className="mb-4 flex w-full shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 md:mb-0 md:w-48">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Đề thi</p>
                          {meta.hasPracticeFile ? (
                            <div className="mt-2 w-full space-y-2">
                              {meta.practiceFiles.map((f, i) => (
                                <a
                                  key={`${f.fileUrl}-${i}`}
                                  href={buildMediaDownloadUrl(f.fileUrl, f.fileName)}
                                  download={f.fileName}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline break-all"
                                >
                                  <Download size={14} className="shrink-0" />
                                  <span>{f.fileName || `Đề ${i + 1}`}</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-center text-[11px] font-semibold text-amber-600">
                              Chưa có đề — liên hệ giáo viên
                            </p>
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">Hướng dẫn nộp bài</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Tải đề về máy, làm bài theo yêu cầu, sau đó nộp đúng định dạng file quy định. Kiểm tra lại tên file trước khi gửi.
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                          <Paperclip size={16} className="text-indigo-500" />
                          Tải lên bài làm
                        </p>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".xlsx,.xls,.docx,.pptx"
                          className="hidden"
                          onChange={(e) => setUploadFile(e.target.files[0])}
                        />
                        {uploadFile ? (
                          <div className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                            <span className="truncate text-sm font-semibold text-indigo-900">{uploadFile.name}</span>
                            <button
                              type="button"
                              onClick={() => setUploadFile(null)}
                              className="ml-2 text-slate-400 hover:text-red-500"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                            className={`cursor-pointer rounded-2xl border-2 border-dashed py-12 text-center transition ${
                              isDragging
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                          >
                            <Upload size={32} className="mx-auto text-slate-300" />
                            <p className="mt-2 text-sm text-slate-600">
                              Kéo thả hoặc <span className="font-bold text-indigo-600">chọn file</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-400">Word, Excel, PowerPoint · tối đa 50MB</p>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={tuLuanSubmitting}
                        onClick={trySubmitTuLuan}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 py-4 text-sm font-black text-white shadow-lg shadow-red-500/25 transition hover:from-red-700 hover:to-red-800 disabled:opacity-60"
                      >
                        <Send size={18} /> {tuLuanSubmitting ? 'ĐANG TẢI LÊN…' : 'NỘP BÀI THỰC HÀNH'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </main>

          <aside className="order-2 flex max-h-[32vh] min-h-0 flex-col lg:order-1 lg:col-span-4 lg:max-h-none xl:col-span-3">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain lg:gap-3">
              <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-sm md:p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600">
                    <LayoutGrid size={16} className="text-indigo-600" />
                    Mục lục câu hỏi
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-600 md:text-sm">
                    {answeredCount}/{TOTAL}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-7 md:gap-2 lg:grid-cols-5">
                  {questions.map((_, i) => {
                    const done = answers[i] !== null;
                    const active = i === currentQ;
                    return (
                      <button
                        key={questions[i].id ?? i}
                        type="button"
                        disabled={isTracNghiemSubmitted || tab !== 'trac_nghiem'}
                        onClick={() => setCurrentQ(i)}
                        className={`flex aspect-square items-center justify-center rounded-lg text-xs font-black transition sm:rounded-xl sm:text-sm md:text-[0.95rem] ${
                          active
                            ? 'bg-red-600 text-white shadow-md shadow-indigo-500/30 ring-2 ring-indigo-300 ring-offset-1 ring-offset-white'
                            : done
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
                        } ${isTracNghiemSubmitted || tab !== 'trac_nghiem' ? 'cursor-default opacity-60' : ''}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600 md:text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-red-600" />
                    Đang xem
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-emerald-400" />
                    Đã trả lời
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded border border-slate-300 bg-slate-100" />
                    Chưa làm
                  </span>
                </div>
              </div>
              <div className="hidden shrink-0 rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs leading-relaxed text-slate-600 shadow-sm lg:block lg:p-4">
                <p className="font-bold text-slate-800">Lưu ý</p>
                <p className="mt-2">
                  Bạn có thể chuyển câu bất kỳ từ lưới bên trên. Thời gian làm bài được tính liên tục. Hệ thống ghi nhận hành vi
                  chuyển tab và mất hình camera theo quy chế thi.
                </p>
              </div>
            </div>
          </aside>
        </div>

        {tab === 'trac_nghiem' && !isTracNghiemSubmitted && (
          <div className="mx-auto mt-1 w-full max-w-[min(100%,90rem)] shrink-0 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md md:mt-2 md:flex md:items-center md:justify-between md:px-5 md:py-2.5">
            <div className="mb-2 md:mb-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tiến độ</p>
              <p className="text-sm font-semibold text-slate-700">
                Đã trả lời{' '}
                <span className={answeredCount === TOTAL ? 'text-emerald-600' : 'text-amber-600'}>
                  {answeredCount}/{TOTAL}
                </span>{' '}
                câu
              </p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={trySubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-black text-white shadow-md shadow-emerald-500/20 transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:rounded-2xl md:px-8 md:py-3.5 md:shadow-lg"
            >
              <CheckCircle size={18} /> {submitting ? 'ĐANG NỘP BÀI…' : 'NỘP BÀI TRẮC NGHIỆM'}
            </button>
          </div>
        )}
      </div>

      {/* ExamMonitor (logic only) */}
      <ExamMonitor ref={monitorRef} isActive={phase === 'test'} onViolate={handleViolation} onResetExam={handleResetExam} requireWebcam={requireWebcam} enableTabGuard={tab !== 'tu_luan'} maxTabWarnings={1} warningSoundUrl={examWarningSoundUrl} />

      {/* ══════════ MODALS ══════════ */}
      {showSubmitConfirm && (
        <ConfirmModal
          title="Cảnh báo"
          message={`câu chưa trả lời.\nVẫn quyết định nộp bài?`}
          boldText={`Bạn còn ${unanswered}`}
          confirmLabel="Nộp bài"
          cancelLabel="Làm tiếp"
          onConfirm={() => { setShowSubmitConfirm(false); void handleSubmitFinal(); }}
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
          onConfirm={() => {
            setShowNoFileConfirm(false);
            setUploadDone(true);
            updateExamProgress({ thucHanh: 'chua_nop', status: 'dang_thi' });
            setPhase('result');
          }}
          onCancel={() => setShowNoFileConfirm(false)}
        />
      )}
    </ExamClickOutsideGuard>
  );
};

export default StudentTest;
