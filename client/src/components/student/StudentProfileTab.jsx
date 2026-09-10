import React, { useState, useEffect } from 'react';
import {
  CheckCircle, User, Settings, BookOpen,
  Mail, Phone, MessageCircle, MapPin, Lock, ChevronRight, ChevronDown,
  GraduationCap, BadgeDollarSign, Wallet, Receipt,
} from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/defaultAvatars';
import EditableAvatar from '../EditableAvatar';
import api from '../../services/api';
import { readOwnedVideoCourseCache } from '../../utils/lmsDeepLink';

function openChangePassword() {
  window.dispatchEvent(new CustomEvent('open-change-password-modal'));
}

function normalizeVideoOrders(rows) {
  const byCourse = new Map();
  for (const o of rows || []) {
    const cid = String(o.courseId || '');
    if (!cid) continue;
    const prev = byCourse.get(cid);
    if (!prev) {
      byCourse.set(cid, o);
      continue;
    }
    if (o.status === 'paid') byCourse.set(cid, o);
    else if (prev.status !== 'paid') byCourse.set(cid, o);
  }
  return [...byCourse.values()].sort(
    (a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0),
  );
}

export default function StudentProfileTab({
  studentData,
  progressPct,
  setShowUpdateProfileModal,
  setShowTuitionModal,
  sessionGender = '',
}) {
  const [openSections, setOpenSections] = useState({
    personal: true,
    summary: true,
    courses: true,
    videoOrders: true,
  });
  const [videoOrders, setVideoOrders] = useState([]);
  const studentId = String(
    studentData?.id || studentData?._id || (() => {
      try { return JSON.parse(localStorage.getItem('student_user') || '{}').id; } catch { return ''; }
    })(),
  );
  const [ownedCourseIds, setOwnedCourseIds] = useState(() => readOwnedVideoCourseCache(studentId));

  const syncOwnedFromServer = async (orders) => {
    const owned = readOwnedVideoCourseCache(studentId);
    const pending = (orders || []).filter((o) => o.status !== 'paid');
    await Promise.all(pending.map(async (o) => {
      const cid = String(o.courseId || '');
      if (!cid || owned.has(cid)) return;
      try {
        const res = await api.trainingLms.getLessons(cid);
        if (res?.meta?.owned) owned.add(cid);
      } catch { /* ignore */ }
    }));
    setOwnedCourseIds(new Set(owned));
    return owned;
  };

  const isOrderPaid = (order, ownedSet = ownedCourseIds) => {
    const cid = String(order?.courseId || '');
    return order?.status === 'paid' || (cid && ownedSet.has(cid));
  };

  useEffect(() => {
    setOwnedCourseIds(readOwnedVideoCourseCache(studentId));
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.trainingLms.listVideoPurchases();
        if (cancelled || !res?.success) return;
        const rows = normalizeVideoOrders(res.data);
        await syncOwnedFromServer(rows);
        if (!cancelled) setVideoOrders(rows);
      } catch { /* ignore */ }
    };
    const onRefresh = () => {
      setOwnedCourseIds(readOwnedVideoCourseCache(studentId));
      load();
    };
    load();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('lms-video-owned-updated', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('lms-video-owned-updated', onRefresh);
    };
  }, [studentId]);
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleResumeVideoPay = (order) => {
    if (!order?.courseId) return;
    window.location.hash = `materials-videos?courseId=${encodeURIComponent(order.courseId)}&resumePay=1`;
  };

  const handleContinueVideoLearning = (order) => {
    if (!order?.courseId) return;
    window.location.hash = `materials-videos?courseId=${encodeURIComponent(order.courseId)}`;
  };

  const profileGender = studentData?.gender || sessionGender || '';

  const teacherValue = Array.isArray(studentData?.teacherNames) && studentData.teacherNames.length
    ? studentData.teacherNames.join(', ')
    : (Array.isArray(studentData?.teacher)
      ? studentData.teacher.filter(Boolean).join(', ')
      : (studentData?.teacher || 'Chưa phân công'));

  const courses = Array.isArray(studentData?.courses) ? studentData.courses : [];
  const tuitionLines = courses.length
    ? courses.map((c) => {
      const name = c.courseName || c.name || 'Khóa học';
      const price = Number(c.price) || 0;
      return `${name}: ${price.toLocaleString('vi-VN')}đ`;
    })
    : [`${Number(studentData?.price || 0).toLocaleString('vi-VN')}đ`];

  return (
    <div className="cms-sd cms-sd-page cms-sd-stack cms-sd-profile">
      {/* Hero */}
      <section className="rounded-2xl lg:rounded-3xl bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 p-4 sm:p-6 lg:p-8 text-white shadow-[0_8px_28px_rgba(0,0,0,0.08)] relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-white/5 rounded-full pointer-events-none" aria-hidden="true" />
        <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-emerald-400/10 rounded-full pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 min-w-0">
          <div className="relative shrink-0 self-start sm:self-center">
            <EditableAvatar
              avatar={studentData?.avatar}
              name={studentData?.name}
              role="student"
              gender={profileGender}
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl border-2 border-white/35 bg-white shadow-lg"
            />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full border-2 border-white flex items-center justify-center">
              <CheckCircle size={12} className="text-white" aria-hidden="true" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight truncate">
              {studentData.name}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-teal-100/95 mt-1 truncate">
              {studentData.course || 'Học viên Thắng Tin Học'}
            </p>
            <div className="mt-3 lg:mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-w-xl">
              <div className="rounded-xl bg-white/12 backdrop-blur-sm px-3 py-2.5 lg:px-4 lg:py-3">
                <p className="text-lg sm:text-xl lg:text-2xl font-extrabold tabular-nums leading-none">{progressPct}%</p>
                <p className="text-[11px] sm:text-xs text-teal-100 mt-1 font-semibold uppercase tracking-wide">Tiến độ</p>
              </div>
              <div className="rounded-xl bg-white/12 backdrop-blur-sm px-3 py-2.5 lg:px-4 lg:py-3">
                <p className="text-lg sm:text-xl lg:text-2xl font-extrabold tabular-nums leading-none">{studentData.avgGrade ?? 0}</p>
                <p className="text-[11px] sm:text-xs text-teal-100 mt-1 font-semibold uppercase tracking-wide">Điểm TB</p>
              </div>
              <div className="rounded-xl bg-white/12 backdrop-blur-sm px-3 py-2.5 lg:px-4 lg:py-3 col-span-2 sm:col-span-1">
                <p className="text-lg sm:text-xl lg:text-2xl font-extrabold tabular-nums leading-none">
                  {studentData.remainingSessions ?? Math.max(0, (studentData.totalSessions || 0) - (studentData.completedSessions || 0))}
                </p>
                <p className="text-[11px] sm:text-xs text-teal-100 mt-1 font-semibold uppercase tracking-wide">Buổi còn lại</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-start">
        {/* Cột trái: bảo mật + thông tin + tóm tắt */}
        <div className="lg:col-span-5 cms-sd-stack min-w-0">
          <section className="cms-sd-card !p-0 overflow-hidden">
            <button
              type="button"
              onClick={openChangePassword}
              className="w-full flex items-center gap-3 px-4 py-3.5 lg:px-5 lg:py-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <span className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Lock size={18} aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm lg:text-base font-bold text-slate-800">Đổi mật khẩu</span>
                <span className="block text-xs lg:text-sm text-slate-500 mt-0.5">Bảo mật tài khoản đăng nhập</span>
              </span>
              <ChevronRight size={18} className="text-slate-300 shrink-0" aria-hidden="true" />
            </button>
          </section>

          <section className="cms-sd-card !p-0 overflow-hidden">
            <div className="px-4 py-3 lg:px-5 lg:py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 min-w-0">
              <button type="button" onClick={() => toggleSection('personal')} className="flex items-center gap-2 text-sm lg:text-base font-extrabold text-slate-800 min-w-0">
                <User size={16} className="text-teal-600 shrink-0" aria-hidden="true" />
                <span className="truncate">Thông tin cá nhân</span>
              </button>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowUpdateProfileModal(true)}
                  className="text-[11px] lg:text-xs font-extrabold uppercase tracking-wide text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 lg:px-3 min-h-9 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Settings size={13} aria-hidden="true" /> Cập nhật
                </button>
                <button type="button" onClick={() => toggleSection('personal')} className="w-9 h-9 rounded-lg hover:bg-slate-50 flex items-center justify-center lg:hidden shrink-0" aria-label="Thu gọn thông tin cá nhân">
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${openSections.personal ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
            <ul className={`${openSections.personal ? 'grid' : 'hidden lg:grid'} grid-cols-1 gap-0.5`}>
              {[
                { icon: Mail, label: 'Email', value: studentData.email || 'Chưa cập nhật' },
                { icon: Phone, label: 'Số điện thoại', value: studentData.phone || studentData.zalo || 'Chưa cập nhật' },
                { icon: Phone, label: 'SĐT Khác', value: studentData.zalo || 'Chưa cập nhật' },
                { icon: MapPin, label: 'Địa chỉ', value: studentData.address || 'Chưa cập nhật' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-3.5 min-w-0 hover:bg-slate-50/60">
                  <item.icon size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] lg:text-sm font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="text-sm lg:text-[15px] font-semibold text-slate-800 truncate">{item.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="cms-sd-card !p-0 overflow-hidden">
            <div className="px-4 py-3 lg:px-5 lg:py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
              <button type="button" onClick={() => toggleSection('summary')} className="text-sm lg:text-base font-extrabold text-slate-800 flex items-center gap-2 min-w-0">
                <BookOpen size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
                <span className="truncate">Tóm tắt học tập</span>
              </button>
              <button type="button" onClick={() => toggleSection('summary')} className="w-9 h-9 rounded-lg hover:bg-slate-50 flex items-center justify-center lg:hidden shrink-0" aria-label="Thu gọn tóm tắt học tập">
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${openSections.summary ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <ul className={`${openSections.summary ? 'grid' : 'hidden lg:grid'} grid-cols-1 gap-0.5`}>
              <li className="flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-3.5 min-w-0">
                <GraduationCap size={16} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] lg:text-sm font-bold uppercase tracking-wide text-slate-400">Giáo viên</p>
                  <p className="text-sm lg:text-[15px] font-semibold text-slate-800">{teacherValue}</p>
                </div>
              </li>
              <li className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-3.5 min-w-0">
                <BadgeDollarSign size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] lg:text-sm font-bold uppercase tracking-wide text-slate-400">Trạng thái</p>
                  <p className="text-sm lg:text-[15px] font-semibold text-slate-800 truncate">{studentData.status}</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-3.5 min-w-0">
                <Wallet size={16} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] lg:text-sm font-bold uppercase tracking-wide text-slate-400">Học phí theo khóa</p>
                  <ul className="mt-1 space-y-1">
                    {tuitionLines.map((line) => (
                      <li key={line} className="text-sm lg:text-[15px] font-semibold text-slate-800 leading-snug">{line}</li>
                    ))}
                  </ul>
                </div>
              </li>
              <li className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-4 py-3 lg:px-5 lg:py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle
                    size={16}
                    className={studentData.paid ? 'text-emerald-500' : 'text-amber-500'}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[11px] lg:text-sm font-bold uppercase tracking-wide text-slate-400">Thanh toán</p>
                    <p className={`text-sm lg:text-[15px] font-bold ${studentData.paid ? 'text-emerald-600' : 'text-red-500'}`}>
                      {studentData.paid ? 'Đã đóng học phí' : 'Chưa đóng'}
                    </p>
                  </div>
                </div>
                {!studentData.paid && (
                  <button
                    type="button"
                    onClick={() => setShowTuitionModal(true)}
                    className="cms-sd-btn bg-red-600 text-white hover:bg-red-700 w-full sm:w-auto shrink-0 whitespace-nowrap"
                  >
                    Đóng ngay
                  </button>
                )}
              </li>
            </ul>
          </section>
        </div>

        {/* Cột phải: khóa học */}
        <div className="lg:col-span-7 min-w-0">
          {courses.length > 0 ? (
            <section className="cms-sd-card !p-0 overflow-hidden h-full">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                <button type="button" onClick={() => toggleSection('courses')} className="text-sm lg:text-base font-extrabold text-slate-800 flex items-center gap-2 min-w-0">
                  <BookOpen size={16} className="text-blue-600 shrink-0" aria-hidden="true" /> Khóa học
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] lg:text-xs font-extrabold bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full tabular-nums">
                    {courses.length}
                  </span>
                  <button type="button" onClick={() => toggleSection('courses')} className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center lg:hidden">
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${openSections.courses ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              <div className={`${openSections.courses ? 'grid' : 'hidden lg:grid'} p-3 lg:p-4 gap-2.5 lg:gap-3 sm:grid-cols-1 xl:grid-cols-2`}>
                {courses.map((c) => {
                  const isCompleted = c.status === 'completed';
                  const total = Number(c.totalSessions) || 12;
                  const done = Number(c.completedSessions) || 0;
                  const pct = Math.round((done / total) * 100) || 0;
                  const title = c.courseName || c.name || 'Khóa học';
                  return (
                    <article
                      key={c.id || c.enrollmentId || title}
                      className={`rounded-2xl border p-3.5 lg:p-4 transition-shadow hover:shadow-md ${
                        isCompleted ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0 mb-3">
                        <div className="min-w-0">
                          <h4 className="text-sm lg:text-[15px] font-bold text-blue-700 uppercase tracking-tight line-clamp-2">
                            {title}
                          </h4>
                          <p className="text-[11px] lg:text-xs font-semibold text-slate-500 mt-1 truncate">
                            GV: {c.teacherName || 'Chưa phân công'}
                            {c.registeredAt ? ` · ${new Date(c.registeredAt).toLocaleDateString('vi-VN')}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] lg:text-[11px] font-extrabold px-2 py-1 rounded-md uppercase shrink-0 ${
                            isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {isCompleted ? 'Xong' : 'Học'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="h-2 bg-white rounded-full overflow-hidden border border-slate-100">
                            <div
                              className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-red-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1.5">
                            <p className="text-[11px] lg:text-xs font-semibold text-slate-500 tabular-nums">
                              {done}/{total} buổi
                            </p>
                            <p className="text-[11px] lg:text-xs font-bold text-slate-600 tabular-nums">{pct}%</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 pl-1">
                          <p className="text-base lg:text-lg font-extrabold text-slate-800 tabular-nums">{c.avgGrade ?? 0}</p>
                          <p className="text-[10px] font-bold uppercase text-slate-400">TB</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="cms-sd-card flex flex-col items-center justify-center py-12 text-center">
              <BookOpen size={28} className="text-slate-300 mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Chưa có khóa học</p>
            </section>
          )}

          {videoOrders.length > 0 && (
            <section className="cms-sd-card !p-0 overflow-hidden mt-4">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <button type="button" onClick={() => toggleSection('videoOrders')} className="text-sm lg:text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Receipt size={16} className="text-violet-600 shrink-0" aria-hidden="true" /> Đơn mua khóa video
                </button>
                <span className="text-[11px] font-extrabold bg-violet-50 text-violet-700 px-2.5 py-0.5 rounded-full tabular-nums">
                  {videoOrders.length}
                </span>
              </div>
              <ul className={`${openSections.videoOrders ? 'block' : 'hidden lg:block'} divide-y divide-slate-100`}>
                {videoOrders.map((o) => {
                  const paid = isOrderPaid(o);
                  return (
                  <li key={o._id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{o.courseTitle || 'Khóa video'}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {paid && o.paidAt
                          ? new Date(o.paidAt).toLocaleString('vi-VN')
                          : (o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '')}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <p className="text-sm font-extrabold text-slate-800 tabular-nums">
                        {Number(o.amount || 0).toLocaleString('vi-VN')}₫
                      </p>
                      {paid ? (
                        <>
                          <p className="text-[10px] font-bold uppercase text-emerald-600">Đã thanh toán</p>
                          <button
                            type="button"
                            onClick={() => handleContinueVideoLearning(o)}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
                          >
                            Tiếp tục học
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold uppercase text-amber-600">Chờ thanh toán</p>
                          <button
                            type="button"
                            onClick={() => handleResumeVideoPay(o)}
                            className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
                          >
                            Tiếp tục thanh toán
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
