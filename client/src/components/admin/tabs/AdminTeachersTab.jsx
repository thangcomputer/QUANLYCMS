import React, { useEffect, useMemo, useRef, useState } from 'react';
import CmsSelect from '../../ui/CmsSelect';
import { useAdminTab } from '../AdminTabContext';
import {
  GraduationCap, Search, Plus, Star, FileSpreadsheet, FileText, CheckCircle2,
  Download, Unlock, UserCheck, DollarSign, Edit3, Trash2, User,
  Phone, CalendarCheck, MessageSquare, X, MoreHorizontal, AlertTriangle,
} from 'lucide-react';
import Avatar from '../shared/Avatar';
import {
  resolveTeacherExamDate,
  isTeacherExamDateApproximate,
  practicalFileDisplayName,
  practicalFileDownloadUrl,
  practicalFileViewUrl,
} from '../utils/teacherExam';
import { isTeacherPending } from '../../../constants/teacherStatus';
import TeacherAccessReasonModal from '../shared/TeacherAccessReasonModal';

const PROCESS_STEPS = [
  'Bài Test ≥ 80đ',
  'Nộp file thực hành',
  'Admin kiểm tra',
  'Cấp quyền',
];

function StatusBadge({ active, pending, locked, suspended }) {
  if (active) return <span className="cms-students-badge-success">Đã cấp quyền</span>;
  if (pending) return <span className="cms-students-badge-neutral" style={{ background: '#fffbeb', color: '#b45309' }}>Chờ duyệt</span>;
  if (suspended) return <span className="cms-students-badge-primary" style={{ background: '#fff7ed', color: '#c2410c' }}>Tạm ngưng</span>;
  if (locked) return <span className="cms-students-badge-primary">Đã khóa</span>;
  return <span className="cms-students-badge-neutral">Chưa cấp quyền</span>;
}

function TeacherActionMenu({
  t,
  openId,
  setOpenId,
  canManageTeacherActions,
  align = 'right',
  setReviewModal,
  setGrantModal,
  setApproveModal,
  setAccessModal,
  setEditTeacher,
  handlePayTeacher,
  removeTeacher,
}) {
  if (openId !== t.id) return null;

  const score = t.testScore;
  const active = ['Active', 'active'].includes(t.status);
  const pending = ['Pending', 'pending'].includes(t.status);
  const locked = String(t.status).toLowerCase() === 'locked';
  const inactive = String(t.status).toLowerCase() === 'inactive' || locked;
  const canApprove = pending && (score || 0) >= 80 && t.practicalStatus === 'reviewed';

  const itemCls =
    'w-full flex items-center gap-3 px-3.5 py-2.5 min-h-10 text-[13px] font-semibold text-left whitespace-nowrap transition-colors';

  const close = () => setOpenId(null);

  return (
    <div
      className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] py-1.5 w-[min(92vw,260px)] animate-in fade-in zoom-in-95 duration-150`}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      {canManageTeacherActions && active && (
        <button type="button" role="menuitem" onClick={() => { handlePayTeacher(t); close(); }}
          className={`${itemCls} text-emerald-700 hover:bg-emerald-50`}>
          <DollarSign size={15} className="shrink-0" />
          <span>Thanh toán lương</span>
        </button>
      )}
      {canManageTeacherActions && active && (
        <button type="button" role="menuitem" onClick={() => { setAccessModal({ id: t.id, name: t.name || t.email || t.phone, type: 'suspend' }); close(); }}
          className={`${itemCls} text-amber-700 hover:bg-amber-50`}>
          <span className="shrink-0">⏸</span><span>Tạm ngưng quyền giảng dạy</span>
        </button>
      )}
      {canManageTeacherActions && String(t.status).toLowerCase() === 'suspended' && (
        <button type="button" role="menuitem" onClick={() => { setAccessModal({ id: t.id, name: t.name || t.email || t.phone, type: 'reactivate' }); close(); }}
          className={`${itemCls} text-emerald-700 hover:bg-emerald-50`}>
          <span className="shrink-0">▶</span><span>Khôi phục quyền giảng dạy</span>
        </button>
      )}
      {canManageTeacherActions && inactive && (
        <button type="button" role="menuitem"
          onClick={() => { setGrantModal({ id: t.id, name: t.name || t.email || t.phone, type: locked ? 'retry' : 'first' }); close(); }}
          className={`${itemCls} text-sky-700 hover:bg-sky-50`}>
          <Unlock size={15} className="shrink-0" />
          <span>{locked ? 'Cấp quyền thi lại' : 'Cấp truy cập thi'}</span>
        </button>
      )}
      {canManageTeacherActions && !active && !pending && String(t.status).toLowerCase() !== 'suspended' && (
        <button type="button" role="menuitem"
          onClick={() => { setAccessModal({ id: t.id, name: t.name || t.email || t.phone, type: 'manual' }); close(); }}
          className={`${itemCls} text-violet-700 hover:bg-violet-50`}>
          <Unlock size={15} className="shrink-0" />
          <span>Cấp quyền thủ công</span>
        </button>
      )}
      {canManageTeacherActions && pending && (
        <button type="button" role="menuitem"
          onClick={() => {
            if (canApprove) setApproveModal(t);
            else setAccessModal({ id: t.id, name: t.name || t.email || t.phone, type: 'manual' });
            close();
          }}
          className={`${itemCls} ${canApprove ? 'text-emerald-700 hover:bg-emerald-50' : 'text-violet-700 hover:bg-violet-50'}`}>
          <UserCheck size={15} className="shrink-0" />
          <span>{canApprove ? 'Cấp quyền giảng dạy' : 'Cấp quyền thủ công'}</span>
        </button>
      )}
      {canManageTeacherActions && t.practicalFile && t.practicalStatus !== 'reviewed' && (
        <button type="button" role="menuitem" onClick={() => { setReviewModal(t); close(); }}
          className={`${itemCls} text-sky-700 hover:bg-sky-50`}>
          <FileSpreadsheet size={15} className="shrink-0" />
          <span>Kiểm tra bài thực hành</span>
        </button>
      )}
      {canManageTeacherActions && (
        <button type="button" role="menuitem" onClick={() => { setEditTeacher(t); close(); }}
          className={`${itemCls} text-slate-700 hover:bg-slate-50`}>
          <Edit3 size={15} className="shrink-0 text-slate-500" />
          <span>Chỉnh sửa hồ sơ &amp; mức lương</span>
        </button>
      )}
      {canManageTeacherActions && (
        <>
          <div className="border-t border-slate-100 my-1" />
          <button type="button" role="menuitem" onClick={() => { removeTeacher(t.id); close(); }}
            className={`${itemCls} text-red-600 hover:bg-red-50`}>
            <Trash2 size={15} className="shrink-0" />
            <span>Xóa giảng viên</span>
          </button>
        </>
      )}
      {!canManageTeacherActions && (
        <p className="px-3.5 py-2 text-[12px] text-slate-400">Chỉ Super / High Admin thao tác được</p>
      )}
    </div>
  );
}

export default function AdminTeachersTab() {
  const {
    teachers, safeTeachers, filteredTeachers, teacherSearch, setTeacherSearch, isSuperAdmin, isHighAdmin, setShowTeacherModal,
    getTeacherRating, setReviewModal, setGrantModal, setApproveModal, setEditTeacher, handlePayTeacher,
    removeTeacher, approveTeacher, fetchTeachers, reviewModal, approveModal, markFileReviewed, toast,
    manualActivateTeacher, suspendTeacher, reactivateTeacher,
  } = useAdminTab();

  const canManageTeacherActions = !!(isSuperAdmin || isHighAdmin);

  const [filterStatus, setFilterStatus] = useState('all');
  const [menuId, setMenuId] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [accessModal, setAccessModal] = useState(null);
  const menuRootRef = useRef(null);

  useEffect(() => {
    if (!menuId) return undefined;
    const onDoc = (e) => {
      if (menuRootRef.current && !menuRootRef.current.contains(e.target)) setMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuId]);

  const pendingCount = safeTeachers.filter((t) => isTeacherPending(t.status)).length;
  const filePending = safeTeachers.filter((t) => t.practicalFile && t.practicalStatus === 'submitted').length;

  const rows = useMemo(() => {
    const list = Array.isArray(filteredTeachers) ? filteredTeachers : [];
    if (filterStatus === 'all') return list;
    return list.filter((t) => {
      const st = String(t.status || '').toLowerCase();
      if (filterStatus === 'active') return st === 'active';
      if (filterStatus === 'pending') return st === 'pending';
      if (filterStatus === 'locked') return st === 'locked';
      if (filterStatus === 'inactive') return st === 'inactive' || (!st);
      if (filterStatus === 'file') return !!t.practicalFile && t.practicalStatus === 'submitted';
      return true;
    });
  }, [filteredTeachers, filterStatus]);

  const selectFilterClass =
    'h-11 w-full bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/15 outline-none transition-all';

  const menuProps = {
    openId: menuId,
    setOpenId: setMenuId,
    canManageTeacherActions,
    setReviewModal,
    setGrantModal,
    setApproveModal,
    setAccessModal,
    setEditTeacher,
    handlePayTeacher,
    removeTeacher,
  };

  return (
    <>
      <div className="cms-students-module cms-viewport-module bg-white rounded-2xl lg:rounded-[28px] border border-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.04)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500" ref={menuRootRef}>
        <div className="px-3 pt-3 pb-2 sm:px-4 lg:px-6 lg:pt-4 space-y-3 shrink-0">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="text-base font-semibold text-slate-900 flex items-start gap-2 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <GraduationCap size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 break-words leading-snug">Quản lý Giảng viên</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg flex-shrink-0 self-center">
                {teachers.length}
              </span>
            </h2>
            <div className="flex flex-wrap gap-1.5 xl:justify-end">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${pendingCount ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {pendingCount} chờ duyệt
              </span>
              {filePending > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">
                  {filePending} file chờ
                </span>
              )}
              <span className="sr-only">Duyệt Giảng Viên</span>
            </div>
          </div>

          {/* Toolbar 1 hàng: Trạng thái | Tìm tên GV | Thêm giảng viên */}
          <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)_auto] gap-2.5 items-center w-full">
            <CmsSelect
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={selectFilterClass}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đã cấp quyền</option>
              <option value="pending">Chờ duyệt</option>
              <option value="inactive">Chưa cấp quyền</option>
              <option value="locked">Đã khóa</option>
              <option value="file">File chờ kiểm tra</option>
            </CmsSelect>

            <div className="relative w-full">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm tên / SĐT giảng viên..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                className="pl-10 pr-3 h-11 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/15 outline-none w-full transition-all"
                aria-label="Tìm giảng viên"
              />
            </div>

            {canManageTeacherActions && (
              <button
                type="button"
                onClick={() => setShowTeacherModal(true)}
                className="cms-students-btn-primary h-11 !px-4 shrink-0 flex items-center justify-center gap-1.5 font-bold"
              >
                <Plus size={16} />
                <span>Thêm giảng viên</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden px-3 pb-3 sm:px-4 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <User size={24} className="opacity-40" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Không tìm thấy giảng viên nào</p>
            </div>
          ) : rows.map((t) => {
            const score = t.testScore;
            const passed = (score || 0) >= 80;
            const rating = getTeacherRating(t.id, t);
            const active = ['Active', 'active'].includes(t.status);
            const pending = ['Pending', 'pending'].includes(t.status);
            const locked = String(t.status).toLowerCase() === 'locked';
            const examDate = resolveTeacherExamDate(t);
            const joinDate = t.createdAt || t.startDate
              ? new Date(t.createdAt || t.startDate).toLocaleDateString('vi-VN')
              : '';

            return (
              <article key={t.id} className={`cms-students-card ${t.practicalStatus === 'submitted' ? 'ring-1 ring-amber-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <Avatar
                    size="card"
                    initials={t.name?.substring(0, 2).toUpperCase() || 'GV'}
                    name={t.name}
                    role="teacher"
                    src={t.avatar}
                    gender={t.gender}
                    color={active ? 'bg-emerald-500' : passed ? 'bg-amber-500' : 'bg-slate-400'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 leading-snug truncate">{t.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {joinDate}{t.phone ? ` · ${t.phone}` : ''}
                          {t.branchCode ? ` · ${t.branchCode}` : ''}
                        </p>
                      </div>
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuId(menuId === t.id ? null : t.id); }}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Thao tác"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        <TeacherActionMenu t={t} {...menuProps} align="right" />
                      </div>
                    </div>

                    {t.specialty && (
                      <p className="mt-1.5 text-sm font-semibold text-sky-700 leading-snug line-clamp-2">{t.specialty}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center justify-between sm:block gap-2 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Điểm / Sao</p>
                    <div className="text-right sm:text-left min-w-0">
                      <p className={`text-[13px] font-bold sm:mt-0.5 ${passed ? 'text-emerald-700' : 'text-red-600'}`}>
                        {score == null ? 'Chưa thi' : `${score}/100`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {rating.count > 0 ? `${rating.avg}/5★` : 'Chưa đánh giá'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:block gap-2 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Lương/buổi</p>
                    <p className="text-[13px] font-bold text-slate-800 sm:mt-0.5 tabular-nums">
                      {(Number(t.baseSalaryPerSession) || 0).toLocaleString('vi-VN')}đ
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:flex sm:flex-col sm:items-end gap-1 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Trạng thái</p>
                    <StatusBadge active={active} pending={pending} locked={locked} suspended={String(t.status).toLowerCase() === 'suspended'} />
                  </div>
                </div>

                {t.practicalFile && (
                  <button
                    type="button"
                    onClick={() => setReviewModal(t)}
                    className="mt-2 w-full text-left text-[12px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5"
                  >
                    <FileSpreadsheet size={13} />
                    {t.practicalStatus === 'reviewed' ? 'Đã duyệt thực hành' : 'File chờ kiểm tra — bấm xem'}
                  </button>
                )}
                {examDate && (
                  <p className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
                    <CalendarCheck size={11} />
                    Thi {examDate.toLocaleDateString('vi-VN')}
                    {isTeacherExamDateApproximate(t) ? ' (ước lượng)' : ''}
                  </p>
                )}
                {locked && t.lockReason && (
                  <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1 flex items-start gap-1">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t.lockReason}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block cms-table-wrap overscroll-x-contain flex-1 min-h-0 overflow-auto touch-pan-x">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Giảng viên</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Chuyên môn</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Điểm / Sao</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lương/buổi</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Thực hành</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Trạng thái</th>
                <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-14" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <User size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold">Không tìm thấy giảng viên nào</p>
                  </td>
                </tr>
              ) : rows.map((t) => {
                const score = t.testScore;
                const passed = (score || 0) >= 80;
                const rating = getTeacherRating(t.id, t);
                const active = ['Active', 'active'].includes(t.status);
                const pending = ['Pending', 'pending'].includes(t.status);
                const locked = String(t.status).toLowerCase() === 'locked';
                const examDate = resolveTeacherExamDate(t);
                const joinDate = t.createdAt || t.startDate
                  ? new Date(t.createdAt || t.startDate).toLocaleDateString('vi-VN')
                  : '';

                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          size="sm"
                          initials={t.name?.substring(0, 2).toUpperCase() || 'GV'}
                          name={t.name}
                          role="teacher"
                          src={t.avatar}
                          gender={t.gender}
                          color={active ? 'bg-emerald-500' : passed ? 'bg-amber-500' : 'bg-slate-400'}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate uppercase tracking-wide">{t.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                            {joinDate && <span>{joinDate}</span>}
                            {t.phone && (
                              <>
                                {joinDate && <span className="text-slate-300">·</span>}
                                <Phone size={10} className="text-slate-400" />
                                <span className="font-mono">{t.phone}</span>
                              </>
                            )}
                          </p>
                          {t.branchCode && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{t.branchCode}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 max-w-[200px]">
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2">{t.specialty || '—'}</p>
                      {t.assignedStudents?.length > 0 && (
                        <p className="text-[11px] text-sky-600 font-semibold mt-0.5">
                          Đang dạy {t.assignedStudents.length} HV
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className={`text-sm font-bold ${score == null ? 'text-slate-400' : passed ? 'text-emerald-700' : 'text-red-600'}`}>
                        {score == null ? 'Chưa thi' : `${score}/100 · ${passed ? 'Đạt' : 'Trượt'}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Star size={11} className={rating.count > 0 ? 'text-amber-500 fill-amber-500' : 'text-slate-300'} />
                        {rating.count > 0 ? `${rating.avg}/5 · ${rating.count} ĐG` : 'Chưa có đánh giá'}
                      </p>
                      {examDate && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Thi {examDate.toLocaleDateString('vi-VN')}
                          {isTeacherExamDateApproximate(t) ? ' ≈' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-bold text-slate-800 tabular-nums">
                        {(Number(t.baseSalaryPerSession) || 0).toLocaleString('vi-VN')}đ
                      </p>
                      <p className="text-xs text-slate-500">/ buổi</p>
                    </td>
                    <td className="px-4 py-3.5">
                      {t.practicalFile ? (
                        <button
                          type="button"
                          onClick={() => setReviewModal(t)}
                          className={`text-left text-[12px] font-semibold rounded-lg px-2 py-1 border ${
                            t.practicalStatus === 'reviewed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-100'
                          }`}
                        >
                          {t.practicalStatus === 'reviewed' ? 'Đã duyệt' : 'Chờ kiểm tra'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Chưa nộp</span>
                      )}
                      {t.approvedAt && (
                        <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> {new Date(t.approvedAt).toLocaleDateString('vi-VN')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <StatusBadge active={active} pending={pending} locked={locked} />
                        {locked && t.lockReason && (
                          <span className="text-[10px] text-red-500 max-w-[120px] line-clamp-2">{t.lockReason}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuId(menuId === t.id ? null : t.id); }}
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Thao tác"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        <TeacherActionMenu t={t} {...menuProps} align="right" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <p className="text-xs text-slate-500 font-medium">
            Hiển thị {rows.length} / {teachers.length} giảng viên
          </p>
        </div>
      </div>

      {reviewModal && (
        <>
          <div className="cms-sheet-backdrop" onClick={() => setReviewModal(null)} aria-hidden="true" />
          <div className="cms-sheet w-full md:max-w-lg" role="dialog" aria-modal="true">
            <div className="cms-sheet-handle md:hidden" aria-hidden="true" />
            <div className="cms-sheet-header">
              <span className="cms-sheet-header__side bg-sky-50 text-sky-600" aria-hidden="true">
                <FileSpreadsheet size={18} />
              </span>
              <h3 className="cms-sheet-header__title">Kiểm tra bài thực hành</h3>
              <button type="button" onClick={() => setReviewModal(null)} className="cms-sheet-header__side bg-slate-50 text-slate-500" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="cms-sheet-body space-y-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
                <p><strong>Giảng viên:</strong> {reviewModal.name}</p>
                <p className="break-all"><strong>File:</strong> {practicalFileDisplayName(reviewModal.practicalFile)}</p>
                <p><strong>Điểm test:</strong> {reviewModal.testScore}/100</p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-[13px] text-sky-800">
                <p className="font-semibold mb-1">Hướng dẫn</p>
                <ol className="list-decimal list-inside space-y-1 text-[12px]">
                  <li>Tải file về hoặc mở xem trực tiếp</li>
                  <li>Kiểm tra nội dung bài làm</li>
                  <li>Đối chiếu yêu cầu đề bài</li>
                  <li>Nếu đạt › xác nhận bên dưới</li>
                </ol>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <a href={practicalFileDownloadUrl(reviewModal.practicalFile)} className="cms-btn cms-btn-secondary flex-1">
                  <Download size={16} /> Tải file
                </a>
                <a href={practicalFileViewUrl(reviewModal.practicalFile)} target="_blank" rel="noopener noreferrer" className="cms-btn cms-btn-outline flex-1">
                  <FileText size={16} /> Mở xem
                </a>
              </div>
            </div>
            <div className="cms-sheet-footer">
              <button type="button" onClick={() => setReviewModal(null)} className="cms-btn cms-btn-outline flex-1">Đóng</button>
              <button type="button" onClick={async () => {
                  setSubmittingAction('review');
                  try {
                    await markFileReviewed(reviewModal.id);
                  } finally {
                    setSubmittingAction(null);
                  }
                }}
                disabled={submittingAction === 'review'} className="cms-btn cms-btn-success flex-[1.4]">
                <CheckCircle2 size={16} /> Đạt yêu cầu
              </button>
            </div>
          </div>
        </>
      )}

      {approveModal && (
        <>
          <div className="cms-sheet-backdrop" onClick={() => setApproveModal(null)} aria-hidden="true" />
          <div className="cms-sheet w-full md:max-w-md" role="dialog" aria-modal="true">
            <div className="cms-sheet-handle md:hidden" aria-hidden="true" />
            <div className="cms-sheet-header">
              <span className="cms-sheet-header__side bg-emerald-50 text-emerald-600" aria-hidden="true">
                <Unlock size={18} />
              </span>
              <h3 className="cms-sheet-header__title">Cấp quyền giảng viên</h3>
              <button type="button" onClick={() => setApproveModal(null)} className="cms-sheet-header__side bg-slate-50 text-slate-500" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="cms-sheet-body space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 flex items-center gap-3">
                <Avatar initials={approveModal.name?.substring(0, 2).toUpperCase() || 'GV'} name={approveModal.name} role="teacher" src={approveModal.avatar} gender={approveModal.gender} color="bg-emerald-500" size="card" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{approveModal.name}</p>
                  <p className="text-[13px] text-slate-500 mt-0.5">Điểm test: <span className="text-emerald-700 font-semibold">{approveModal.testScore}/100</span></p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-slate-500">Quyền được mở</p>
                {[
                  { icon: Phone, label: 'Xem danh sách học viên' },
                  { icon: CalendarCheck, label: 'Điểm danh & trừ buổi' },
                  { icon: MessageSquare, label: 'Nhắn tin Zalo / Hộp thư' },
                  { icon: FileSpreadsheet, label: 'Cập nhật tài liệu' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-[13px] text-slate-600">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Icon size={13} />
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="cms-sheet-footer">
              <button type="button" onClick={() => setApproveModal(null)} className="cms-btn cms-btn-outline flex-1">Hủy</button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await approveTeacher(approveModal.id);
                    setApproveModal(null);
                    toast.success('Đã cấp quyền giảng dạy!');
                    fetchTeachers();
                  } catch (err) {
                    toast.error('Lỗi cấp quyền: ' + (err.message || 'Không xác định'));
                  }
                }}
                className="cms-btn cms-btn-success flex-[1.4]"
              >
                <UserCheck size={16} /> Cấp quyền
              </button>
            </div>
          </div>
        </>
      )}
      <TeacherAccessReasonModal
        modal={accessModal}
        onCancel={() => setAccessModal(null)}
        onConfirm={async (reason) => {
          try {
            if (accessModal.type === 'manual') await manualActivateTeacher(accessModal.id, reason);
            else if (accessModal.type === 'suspend') await suspendTeacher(accessModal.id, reason);
            else await reactivateTeacher(accessModal.id);
            toast.success(accessModal.type === 'manual' ? 'Đã cấp quyền thủ công' : accessModal.type === 'suspend' ? 'Đã tạm ngưng quyền' : 'Đã hoạt động lại quyền');
            setAccessModal(null);
            fetchTeachers();
          } catch (err) {
            toast.error(err.message || 'Không thể cập nhật quyền giảng dạy');
          }
        }}
      />
    </>
  );
}
