import React, { useEffect, useMemo } from 'react';
import CmsSelect from '../../ui/CmsSelect';
import { Edit3, X, Save, KeyRound, CreditCard, MapPin, DollarSign, Star } from 'lucide-react';
import { BankSelect } from '../../BankSelect';
import TeacherScheduleHistoryPanel from '../../TeacherScheduleHistoryPanel';
import { useData } from '../../../context/DataContext';
import ExamSubjectCheckboxGrid from './ExamSubjectCheckboxGrid';
import { formatSubjectIdsAsSpecialty, resolveTeacherSubjectIds } from '../../../utils/examSubjects';
import {
  formatHoaHong,
  formatStarBonusRule,
  STAR_BONUS_AMOUNT,
  STAR_BONUS_MIN_STARS,
  STAR_BONUS_MIN_STUDENTS,
} from '../../../utils/teacherCommission';
import { VOICE_REGION_OPTIONS } from '../../../constants/voiceRegions';

const SALARY_PRESETS = [100000, 130000, 150000, 180000];

export default function EditTeacherModal({
  editTeacher, setEditTeacher, onClose, onSave, onResetPassword, isSuperAdmin, safeBranches,
  getTeacherRating,
}) {
  const { examSubjectsCatalog, examAdminGroupLabel } = useData() || {};

  useEffect(() => {
    if (!editTeacher) return;
    const hasIds = Array.isArray(editTeacher.subjectIds) && editTeacher.subjectIds.length > 0;
    if (hasIds) {
      const expected = formatSubjectIdsAsSpecialty(editTeacher.subjectIds, examSubjectsCatalog);
      if (expected && expected !== editTeacher.specialty) {
        setEditTeacher((p) => (p ? { ...p, specialty: expected } : p));
      }
      return;
    }
    const resolved = resolveTeacherSubjectIds(editTeacher, examSubjectsCatalog);
    if (!resolved.length) return;
    setEditTeacher((prev) => {
      if (!prev || (Array.isArray(prev.subjectIds) && prev.subjectIds.length > 0)) return prev;
      return {
        ...prev,
        subjectIds: resolved,
        specialty: formatSubjectIdsAsSpecialty(resolved, examSubjectsCatalog) || prev.specialty,
      };
    });
  }, [editTeacher?.id, editTeacher?._id, examSubjectsCatalog, setEditTeacher]);

  const rating = useMemo(() => {
    if (!editTeacher || typeof getTeacherRating !== 'function') return null;
    return getTeacherRating(editTeacher.id || editTeacher._id, editTeacher);
  }, [editTeacher, getTeacherRating]);

  if (!editTeacher) return null;

  const isHistory = editTeacher._tab === 'history';
  const salary = Number(editTeacher.baseSalaryPerSession) || 0;
  const avg = Number(rating?.avg) || 0;
  const count = Number(rating?.count) || 0;
  const branches = (safeBranches || []).filter((b) => b && b.isActive !== false);

  return (
    <>
      <div className="cms-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hồ sơ giảng viên"
        className="cms-sheet cms-sheet--wide cms-sheet--compact cms-sheet--teacher-form w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cms-sheet-handle md:hidden" aria-hidden="true" />
        <div className="cms-sheet-header">
          <span className="cms-sheet-header__side bg-sky-50 text-sky-600" aria-hidden="true">
            <Edit3 size={18} />
          </span>
          <div className="min-w-0 px-1 text-center">
            <h3 className="cms-sheet-header__title">Hồ sơ giảng viên</h3>
            {editTeacher.name && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{editTeacher.name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="cms-sheet-header__side bg-slate-50 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="cms-sheet-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isHistory}
            onClick={() => setEditTeacher((p) => ({ ...p, _tab: 'info' }))}
            className={`cms-sheet-tab ${!isHistory ? 'is-active' : ''}`}
          >
            Thông tin chung
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isHistory}
            onClick={() => setEditTeacher((p) => ({ ...p, _tab: 'history' }))}
            className={`cms-sheet-tab ${isHistory ? 'is-active' : ''}`}
          >
            Lịch sử sắp lịch
          </button>
        </div>

        <div className="cms-sheet-body">
          {isHistory ? (
            <TeacherScheduleHistoryPanel teacherId={editTeacher.id || editTeacher._id} />
          ) : (
            <div className="space-y-4">
              {/* 1. Cá nhân */}
              <section>
                <div className="cms-step">
                  <span className="cms-step__num">1</span>
                  <span className="cms-step__label">Thông tin cá nhân</span>
                </div>
                <div className="cms-form space-y-2.5">
                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label">Họ tên</label>
                      <input
                        type="text"
                        value={editTeacher.name || ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, name: e.target.value }))}
                        className="cms-input"
                      />
                    </div>
                    <div>
                      <label className="cms-label">SĐT / Zalo</label>
                      <input
                        type="text"
                        value={editTeacher.phone || ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, phone: e.target.value }))}
                        className="cms-input font-mono"
                      />
                    </div>
                  </div>
                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label">Email</label>
                      <input
                        type="email"
                        value={editTeacher.email || ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, email: e.target.value }))}
                        className="cms-input"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="cms-label">Ngày vào làm</label>
                      <input
                        type="date"
                        value={editTeacher.startDate ? new Date(editTeacher.startDate).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, startDate: e.target.value }))}
                        className="cms-input"
                      />
                    </div>
                  </div>
                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label">Địa chỉ</label>
                      <input
                        type="text"
                        value={editTeacher.address || ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, address: e.target.value }))}
                        className="cms-input"
                        placeholder="Nhập địa chỉ..."
                      />
                    </div>
                    <div>
                      <label className="cms-label">Giọng (vùng miền)</label>
                      <CmsSelect
                        value={editTeacher.voiceRegion || ''}
                        onChange={(e) => setEditTeacher((p) => ({ ...p, voiceRegion: e.target.value }))}
                        className="cms-input cursor-pointer"
                      >
                        <option value="">— Chưa chọn —</option>
                        {VOICE_REGION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </CmsSelect>
                    </div>
                  </div>
                  <div>
                    <label className="cms-label">Giới thiệu (Bio)</label>
                    <input
                      type="text"
                      value={editTeacher.bio || ''}
                      onChange={(e) => setEditTeacher((p) => ({ ...p, bio: e.target.value }))}
                      className="cms-input"
                      placeholder="Kinh nghiệm, bằng cấp..."
                    />
                  </div>
                </div>
              </section>

              {/* 2. Công việc */}
              <section>
                <div className="cms-step">
                  <span className="cms-step__num cms-step__num--muted">2</span>
                  <span className="cms-step__label">Chuyên môn &amp; trạng thái</span>
                </div>
                <div className="cms-form space-y-2.5">
                  <ExamSubjectCheckboxGrid
                    catalog={examSubjectsCatalog}
                    value={editTeacher.subjectIds || []}
                    accent="red"
                    columns={3}
                    dense
                    groupLabels={{ admin: examAdminGroupLabel }}
                    onChange={(ids) => setEditTeacher((p) => ({
                      ...p,
                      subjectIds: ids,
                      specialty: formatSubjectIdsAsSpecialty(ids, examSubjectsCatalog),
                    }))}
                  />

                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label">Trạng thái duyệt</label>
                      <CmsSelect
                        value={String(editTeacher.status || 'inactive').toLowerCase()}
                        className="cms-input"
                        disabled
                      >
                        <option value="inactive">Chưa cấp quyền</option>
                        <option value="pending">Cấp quyền thi (chờ làm bài)</option>
                        <option value="active">Đã cấp quyền (Active)</option>
                        <option value="locked">Đã khóa</option>
                        <option value="suspended">Tạm ngưng quyền giảng dạy</option>
                      </CmsSelect>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Dùng menu thao tác để cấp, tạm ngưng hoặc khôi phục quyền giảng dạy.
                      </p>
                    </div>
                    <div>
                      <label className="cms-label flex items-center gap-1">
                        <MapPin size={12} /> Chi nhánh
                      </label>
                      {isSuperAdmin ? (
                        <CmsSelect
                          value={editTeacher.branchId || ''}
                          onChange={(e) => {
                            const id = e.target.value;
                            const b = branches.find((x) => String(x._id) === String(id));
                            setEditTeacher((p) => ({
                              ...p,
                              branchId: id,
                              branchCode: b?.code || '',
                            }));
                          }}
                          className="cms-input"
                        >
                          <option value="">— Chưa phân chi nhánh —</option>
                          {branches.map((b) => (
                            <option key={b._id} value={b._id}>
                              {b.name}{b.code ? ` (${b.code})` : ''}
                            </option>
                          ))}
                        </CmsSelect>
                      ) : (
                        <input
                          type="text"
                          readOnly
                          value={editTeacher.branchCode || 'Chi nhánh hiện tại'}
                          className="cms-input opacity-70 cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Lương */}
              <section>
                <div className="cms-step">
                  <span className="cms-step__num cms-step__num--muted">3</span>
                  <span className="cms-step__label">Lương cứng &amp; thưởng sao</span>
                </div>
                <div className="cms-form space-y-2.5">
                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label flex items-center gap-1.5">
                        <DollarSign size={12} /> Lương cứng / buổi
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={salary || ''}
                        onChange={(e) => setEditTeacher((p) => ({
                          ...p,
                          baseSalaryPerSession: Number(e.target.value.replace(/\D/g, '')) || 0,
                        }))}
                        className="cms-input font-mono font-semibold tabular-nums"
                        placeholder="150000"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {SALARY_PRESETS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setEditTeacher((p) => ({ ...p, baseSalaryPerSession: amt }))}
                            className={`text-xs font-semibold px-2 py-1 rounded-md border transition ${
                              salary === amt
                                ? 'border-sky-400 bg-sky-50 text-sky-800'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {formatHoaHong(amt)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="cms-label flex items-center gap-1.5">
                        <Star size={12} className="text-amber-500 fill-amber-500" /> Thưởng sao / tháng (VNĐ)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editTeacher.customStarBonusAmount != null ? editTeacher.customStarBonusAmount : 200000}
                        onChange={(e) => setEditTeacher((p) => ({
                          ...p,
                          customStarBonusAmount: Number(e.target.value.replace(/\D/g, '')) || 0,
                        }))}
                        className="cms-input font-mono font-semibold tabular-nums"
                        placeholder="200000"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {[100000, 200000, 300000, 500000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setEditTeacher((p) => ({ ...p, customStarBonusAmount: amt }))}
                            className={`text-xs font-semibold px-2 py-1 rounded-md border transition ${
                              (editTeacher.customStarBonusAmount ?? 200000) === amt
                                ? 'border-amber-400 bg-amber-50 text-amber-800'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {formatHoaHong(amt)}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {count > 0
                          ? <>Đánh giá HV: <strong className="text-amber-700">{avg}/5★</strong> ({count} đánh giá)</>
                          : 'Chưa có đánh giá từ HV'}
                      </p>
                    </div>

                  </div>
                </div>
              </section>

              {/* 4. Ngân hàng */}
              <section>
                <div className="cms-step">
                  <span className="cms-step__num cms-step__num--muted">4</span>
                  <span className="cms-step__label">Ngân hàng nhận lương</span>
                </div>
                <div className="cms-form space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
                  <div>
                    <label className="cms-label flex items-center gap-1.5">
                      <CreditCard size={12} /> Ngân hàng
                    </label>
                    <BankSelect
                      value={editTeacher.bankAccount?.bankCode || ''}
                      onChange={(bank) => setEditTeacher((p) => ({
                        ...p,
                        bankAccount: {
                          ...(p.bankAccount || {}),
                          bankCode: bank.bin,
                          bankName: bank.shortName,
                        },
                      }))}
                    />
                  </div>
                  <div className="cms-form-row">
                    <div>
                      <label className="cms-label">Số tài khoản</label>
                      <input
                        type="text"
                        value={editTeacher.bankAccount?.accountNumber || ''}
                        onChange={(e) => setEditTeacher((p) => ({
                          ...p,
                          bankAccount: {
                            ...(p.bankAccount || {}),
                            accountNumber: e.target.value.replace(/\D/g, ''),
                          },
                        }))}
                        className="cms-input font-mono"
                        placeholder="123456789"
                      />
                    </div>
                    <div>
                      <label className="cms-label">Chủ tài khoản</label>
                      <input
                        type="text"
                        value={editTeacher.bankAccount?.accountHolder || editTeacher.bankAccount?.accountName || ''}
                        onChange={(e) => setEditTeacher((p) => ({
                          ...p,
                          bankAccount: {
                            ...(p.bankAccount || {}),
                            accountHolder: e.target.value.toUpperCase(),
                            accountName: e.target.value.toUpperCase(),
                          },
                        }))}
                        className="cms-input uppercase"
                        placeholder="NGUYEN VAN A"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className={`cms-sheet-footer ${!isHistory ? 'cms-sheet-footer--triple' : ''}`}>
          <button type="button" onClick={onClose} className="cms-btn cms-btn-outline">
            {isHistory ? 'Đóng' : 'Huỷ'}
          </button>
          {!isHistory && (
            <>
              <button
                type="button"
                onClick={() => onResetPassword?.(editTeacher.id || editTeacher._id, editTeacher.name)}
                className="cms-btn cms-btn-outline"
              >
                <KeyRound size={15} /> Cấp MK
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!(Array.isArray(editTeacher.subjectIds) && editTeacher.subjectIds.filter(Boolean).length)}
                className="cms-btn cms-btn-primary"
              >
                <Save size={16} /> Lưu
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
