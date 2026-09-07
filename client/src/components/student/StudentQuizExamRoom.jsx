import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock, ArrowLeft, Send, AlertTriangle,
  ChevronLeft, ChevronRight, LayoutGrid, Award, RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../utils/toast';
import { useData } from '../../context/DataContext';
import ExamClickOutsideGuard from '../exam/ExamClickOutsideGuard';

/** Lớp phủ toàn app — che sidebar/header/messenger */
function ExamOverlay({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(
    <div
      data-exam-surface
      className="fixed inset-0 z-[99999] h-[100dvh] w-screen max-w-[100vw] bg-[#0b1018] text-white flex flex-col overflow-hidden font-sans"
      style={{ isolation: 'isolate' }}
      role="dialog"
      aria-modal="true"
      aria-label="Phòng thi trắc nghiệm"
    >
      {children}
    </div>,
    document.body
  );
}

async function enterBrowserFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch { /* trình duyệt có thể chặn */ }
}

async function leaveBrowserFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch { /* ignore */ }
}

export default function StudentQuizExamRoom({ quizId, onBack }) {
  const toast = useToast();
  const { examWarningSoundUrl = '' } = useData() || {};
  const [loading, setLoading] = useState(true);
  const [quizData, setQuizData] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const timerRef = useRef(null);
  const resultDataRef = useRef(null);
  const submittingRef = useRef(false);
  const selectedAnswersRef = useRef({});
  const quizDataRef = useRef(null);
  const allowUnloadRef = useRef(false);
  const forfeitKey = `quiz_forfeit_pending:${quizId}`;

  useEffect(() => { resultDataRef.current = resultData; }, [resultData]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);
  useEffect(() => { selectedAnswersRef.current = selectedAnswers; }, [selectedAnswers]);
  useEffect(() => { quizDataRef.current = quizData; }, [quizData]);

  const applyResult = useCallback((data) => {
    if (!data) return;
    allowUnloadRef.current = true;
    try { localStorage.removeItem(forfeitKey); } catch { /* ignore */ }
    setResultData(data);
  }, [forfeitKey]);

  const submitForfeit = useCallback(async (reason, { leaveAfter = false } = {}) => {
    if (resultDataRef.current || submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    setShowExitModal(false);
    setShowConfirmModal(false);
    try {
      const res = await api.quizzes.submit(quizId, [], {
        forfeit: true,
        exitReason: reason || 'Thoát giữa giờ làm bài',
      });
      if (res?.success && res.data) {
        applyResult(res.data);
        toast.error(res.message || 'Bạn đã bị tính RỚT do thoát giữa giờ');
        if (leaveAfter) onBack?.();
        return true;
      }
      if (res?.code === 'QUIZ_FORFEITED' && res.data) {
        applyResult(res.data);
        toast.error(res.message || 'Bạn đã bị tính RỚT do thoát giữa giờ');
        if (leaveAfter) onBack?.();
        return true;
      }
      toast.error(res?.message || 'Không ghi nhận được trạng thái thoát');
      return false;
    } catch {
      toast.error('Lỗi kết nối khi ghi nhận thoát bài');
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [quizId, applyResult, toast, onBack]);

  // 1. Tải đề + xử lý dấu vết thoát lần trước (reload/đóng tab)
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');

    const tryPendingForfeit = async () => {
      let pendingForfeit = false;
      try { pendingForfeit = localStorage.getItem(forfeitKey) === '1'; } catch { /* ignore */ }
      if (!pendingForfeit) return;
      await submitForfeit('Tải lại hoặc đóng trang khi đang làm bài');
    };

    api.quizzes.getQuizForExam(quizId)
      .then(async (res) => {
        if (!active) return;
        if (!res.success || !res.data) {
          setLoadError(res.message || 'Không có dữ liệu bài thi');
          toast.error(res.message || 'Không thể tải bài trắc nghiệm');
          await tryPendingForfeit();
          return;
        }
        setQuizData(res.data);
        setTimeLeft((res.data.timeLimitMinutes || 15) * 60);

        if (res.data.mySubmission) {
          applyResult({
            score: res.data.mySubmission.score,
            correctCount: res.data.mySubmission.correctCount,
            totalQuestions: res.data.mySubmission.totalQuestions,
            status: res.data.mySubmission.status,
            submittedAt: res.data.mySubmission.submittedAt,
            forfeit: !!res.data.mySubmission.forfeit,
            exitReason: res.data.mySubmission.exitReason || '',
            detailedReview: res.data.detailedReview || [],
          });
          return;
        }

        await tryPendingForfeit();
      })
      .catch(async (err) => {
        if (!active) return;
        const msg = err?.data?.message || err?.message || 'Lỗi kết nối máy chủ';
        setLoadError(msg);
        toast.error(msg);
        await tryPendingForfeit();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [quizId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Đếm ngược thời gian
  useEffect(() => {
    if (loading || resultData) return undefined;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          toast.info('Hết giờ làm bài! Đang tự động nộp bài...');
          submitAnswersRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, resultData, toast]);

  const submitAnswers = useCallback(async () => {
    if (submittingRef.current || resultDataRef.current || !quizDataRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setShowConfirmModal(false);

    const questions = quizDataRef.current.questions || [];
    const answersMap = selectedAnswersRef.current;
    const answerArray = questions.map((_, idx) => (
      answersMap[idx] !== undefined ? answersMap[idx] : null
    ));

    try {
      const res = await api.quizzes.submit(quizId, answerArray);
      if (res.success && res.data) {
        applyResult(res.data);
        toast.success('Đã nộp bài thành công!');
      } else if (res?.code === 'QUIZ_FORFEITED' && res.data) {
        applyResult(res.data);
        toast.error(res.message || 'Bạn đã bị tính RỚT do thoát giữa giờ');
      } else {
        toast.error(res.message || 'Lỗi nộp bài');
      }
    } catch {
      toast.error('Lỗi nộp bài trắc nghiệm');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [quizId, applyResult, toast]);

  const submitAnswersRef = useRef(submitAnswers);
  useEffect(() => { submitAnswersRef.current = submitAnswers; }, [submitAnswers]);

  // Khóa scroll body khi mở phòng thi
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      leaveBrowserFullscreen();
    };
  }, []);

  // Toàn màn hình trình duyệt khi đang làm bài (chưa có kết quả)
  useEffect(() => {
    if (loading || !quizData || resultData) return undefined;
    enterBrowserFullscreen();

    const onFsChange = () => {
      const stillInExam = Boolean(quizDataRef.current && !resultDataRef.current);
      if (!document.fullscreenElement && stillInExam && !allowUnloadRef.current) {
        setShowExitModal(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [loading, quizData, resultData]);

  // Có kết quả → thoát fullscreen browser (vẫn giữ overlay app)
  useEffect(() => {
    if (resultData) leaveBrowserFullscreen();
  }, [resultData]);

  // Reload / đóng tab vẫn cảnh báo + ghi rớt (không bắt F5/Back browser — chỉ nút ← trong phòng thi)
  useEffect(() => {
    const inExam = () => Boolean(quizDataRef.current && !resultDataRef.current && !loading);

    const handleBeforeUnload = (e) => {
      if (!inExam() || allowUnloadRef.current) return;
      e.preventDefault();
      e.returnValue = 'Thoát lúc này sẽ bị tính RỚT. Bạn có chắc không?';
    };

    const markPendingAndBeacon = () => {
      if (!inExam() || allowUnloadRef.current) return;
      try { localStorage.setItem(forfeitKey, '1'); } catch { /* ignore */ }
      api.quizzes.submitForfeitBeacon(quizId, 'Tải lại hoặc đóng trang khi đang làm bài');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', markPendingAndBeacon);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', markPendingAndBeacon);
    };
  }, [quizId, forfeitKey, loading]);

  const handleLeaveExamRoom = useCallback(() => {
    allowUnloadRef.current = true;
    leaveBrowserFullscreen();
    onBack?.();
  }, [onBack]);

  const requestExit = () => {
    if (resultData) {
      handleLeaveExamRoom();
      return;
    }
    setShowExitModal(true);
  };

  const stayInExam = () => {
    setShowExitModal(false);
    enterBrowserFullscreen();
  };

  const confirmExitForfeit = () => {
    submitForfeit('Thoát phòng thi giữa giờ', { leaveAfter: false });
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <ExamOverlay>
        <div className="flex-1 flex flex-col items-center justify-center text-white">
          <RefreshCw className="animate-spin text-emerald-400 mb-3" size={32} />
          <p className="text-sm font-bold">Đang tải phòng thi trắc nghiệm...</p>
        </div>
      </ExamOverlay>
    );
  }

  if (!quizData && !resultData) {
    return (
      <ExamOverlay>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-white">
          <p className="text-base font-bold text-red-400 mb-4">{loadError || 'Không có dữ liệu bài thi'}</p>
          <button type="button" onClick={handleLeaveExamRoom} className="px-4 py-2 bg-slate-800 rounded-xl text-sm font-bold">
            Quay lại
          </button>
        </div>
      </ExamOverlay>
    );
  }

  const questions = quizData?.questions || [];
  const currentQ = questions[currentIndex];
  const answeredCount = Object.keys(selectedAnswers).length;

  // ── 4. MÀN HÌNH KẾT QUẢ VÀ XEM LẠI BÀI ──────────────────────────────────────
  if (resultData) {
    const isForfeit = !!resultData.forfeit;
    const isPassed = !isForfeit && (resultData.status === 'passed' || resultData.score >= 70);
    return (
      <ExamOverlay>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <button
              type="button"
              onClick={handleLeaveExamRoom}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition"
            >
              <ArrowLeft size={16} /> Quay lại danh sách
            </button>
            <span className="text-xs font-bold text-slate-400">Kết quả bài trắc nghiệm</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden shadow-2xl">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
              isPassed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              <Award size={40} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mb-1">{quizData?.title || 'Bài trắc nghiệm'}</h1>
            <p className="text-xs text-slate-400 mb-6">Giảng viên: {quizData?.teacherName || '—'}</p>

            <div className="inline-flex flex-col items-center justify-center px-8 py-4 rounded-2xl bg-white/5 border border-white/10 mb-6">
              <span className="text-4xl sm:text-5xl font-black text-amber-400 tabular-nums">
                {resultData.score}%
              </span>
              <span className={`text-xs font-bold uppercase tracking-wider mt-1 ${isPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                {isForfeit ? 'RỚT · THOÁT GIỮA GIỜ' : (isPassed ? 'ĐẠT YÊU CẦU' : 'CHƯA ĐẠT')}
              </span>
            </div>

            {isForfeit && (
              <p className="text-xs text-red-300/90 mb-6 max-w-md mx-auto leading-relaxed">
                {resultData.exitReason || 'Bạn đã thoát phòng thi khi đang làm bài nên bị tính RỚT.'}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-left text-xs font-semibold">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Số câu đúng</span>
                <span className="text-emerald-400 font-bold text-sm">{resultData.correctCount ?? 0}/{resultData.totalQuestions ?? 0}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Số câu sai</span>
                <span className="text-red-400 font-bold text-sm">
                  {Math.max(0, (resultData.totalQuestions || 0) - (resultData.correctCount || 0))}
                </span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Thời gian làm</span>
                <span className="text-white font-bold text-sm">{quizData?.timeLimitMinutes != null ? `${quizData.timeLimitMinutes} phút` : '—'}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Trạng thái</span>
                <span className={`font-bold text-sm ${isPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isForfeit ? 'Rớt do thoát' : (isPassed ? 'Đã hoàn thành' : 'Cần học lại')}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-4">Học viên không xem được đáp án chi tiết.</p>
          </div>
        </div>
        </div>
      </ExamOverlay>
    );
  }

  // ── 5. MÀN HÌNH THI TRẮC NGHIỆM (TOÀN MÀN HÌNH) ─────────────────────────────
  return (
    <ExamOverlay>
    <ExamClickOutsideGuard
      enabled={!resultData && !loading && !!quizData}
      soundUrl={examWarningSoundUrl}
      watchVisibility
      maxStrikes={1}
      onMaxStrikes={() => { void submitForfeit('Bấm ra ngoài vùng làm bài khi đang thi'); }}
      className="flex-1 min-h-0 flex flex-col select-none overflow-x-hidden"
    >
      {/* ── TOPBAR PHÒNG THI ── */}
      <header className="h-14 bg-[#0e1420] border-b border-white/10 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={requestExit}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base text-slate-100 truncate">{quizData.title}</h1>
            <p className="text-[11px] text-slate-400 truncate">Lớp: {quizData.courseName || 'Bài thi trắc nghiệm'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-xl text-amber-300 font-black text-sm tabular-nums">
            <Clock size={16} className="text-amber-400 animate-pulse" />
            <span>{formatTime(timeLeft)}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-red-900/30 flex items-center gap-1.5"
          >
            <Send size={14} /> Nộp bài
          </button>
        </div>
      </header>

      {/* ── NỘI DUNG CHÍNH (2 CỘT PADDING CHUẨN) ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* Cột trái: Câu hỏi hiện tại */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {currentQ ? (
            <div className="max-w-3xl mx-auto w-full space-y-4">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400 border-b border-white/10 pb-3">
                <span className="text-sky-400 uppercase tracking-widest text-[11px]">
                  Câu hỏi {currentIndex + 1} / {questions.length}
                </span>
                <span>Đã chọn: {answeredCount}/{questions.length}</span>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-relaxed mb-4">
                  {currentQ.questionText}
                </h2>

                <div className="space-y-2.5">
                  {(currentQ.options || []).map((opt, optIdx) => {
                    const isSelected = selectedAnswers[currentIndex] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          setSelectedAnswers(prev => ({ ...prev, [currentIndex]: optIdx }));
                        }}
                        className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md shadow-emerald-900/20'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full border text-xs font-black flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                            : 'border-white/20 text-slate-400'
                        }`}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="text-sm font-semibold flex-1 leading-snug">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Điều hướng Trước / Sau */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={currentIndex <= 0}
                  onClick={() => setCurrentIndex(prev => prev - 1)}
                  className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5 transition text-slate-200"
                >
                  <ChevronLeft size={16} /> Câu trước
                </button>
                <button
                  type="button"
                  disabled={currentIndex >= questions.length - 1}
                  onClick={() => setCurrentIndex(prev => prev + 1)}
                  className="px-4 py-2.5 rounded-xl border border-sky-500/40 bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5 transition text-sky-100"
                >
                  Câu tiếp <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-center py-10 text-slate-400 text-sm">Chưa có câu hỏi</p>
          )}
        </div>

        {/* Cột phải: Ma trận số câu hỏi (Sidebar) */}
        <div className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-white/10 p-4 sm:p-5 bg-[#0e1420] flex flex-col shrink-0 lg:overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-300">
            <LayoutGrid size={16} className="text-sky-400" />
            <span>Danh sách câu hỏi</span>
          </div>

          <div className="grid grid-cols-5 gap-2 content-start self-start w-full max-h-[min(40vh,280px)] lg:max-h-none overflow-y-auto pr-0.5">
            {questions.map((_, idx) => {
              const isAnswered = selectedAnswers[idx] !== undefined;
              const isCurrent = idx === currentIndex;
              let btnStyle = 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10';
              if (isCurrent) {
                btnStyle = 'bg-sky-500 text-slate-950 font-black border-sky-300 ring-2 ring-sky-400/40';
              } else if (isAnswered) {
                btnStyle = 'bg-emerald-500/30 border-emerald-500/60 text-emerald-200 font-bold';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-10 rounded-xl border text-xs font-bold flex items-center justify-center transition-all ${btnStyle}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-[11px] text-slate-400 font-semibold shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-sky-500 border border-sky-300" />
              <span>Đang xem</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-emerald-500/30 border border-emerald-500/60" />
              <span>Đã làm ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-white/5 border border-white/10" />
              <span>Chưa làm ({questions.length - answeredCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL XÁC NHẬN NỘP BÀI ── */}
      {showConfirmModal && (
        <div data-exam-modal className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161d2a] border border-white/10 rounded-2xl max-w-sm w-full p-6 text-white space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={20} /> Xác nhận nộp bài?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn đã hoàn thành <strong>{answeredCount}/{questions.length}</strong> câu hỏi. Bạn có chắc chắn muốn nộp bài thi ngay bây giờ?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold transition"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitAnswers}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-md"
              >
                {submitting ? 'Đang nộp...' : 'Nộp bài ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL THOÁT = RỚT ── */}
      {showExitModal && (
        <div data-exam-modal className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161d2a] border border-red-500/30 rounded-2xl max-w-sm w-full p-6 text-white space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="text-red-400" size={20} /> Thoát sẽ bị RỚT
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn đang trong giờ làm bài. Nếu thoát hoặc tải lại trang, bài sẽ được ghi nhận <strong className="text-red-300">RỚT (0 điểm)</strong> và gửi cho giảng viên.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={stayInExam}
                className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold transition"
              >
                Ở lại làm tiếp
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={confirmExitForfeit}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-md"
              >
                {submitting ? 'Đang ghi nhận...' : 'Đồng ý thoát (Rớt)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ExamClickOutsideGuard>
    </ExamOverlay>
  );
}
