import React, { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Unlock, X } from 'lucide-react';

export default function TeacherAccessReasonModal({ modal, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    setReason('');
  }, [modal?.id, modal?.type]);
  if (!modal) return null;
  const isManual = modal.type === 'manual';
  const needsReason = isManual || modal.type === 'suspend';
  const title = isManual ? 'Cấp quyền thủ công' : modal.type === 'suspend' ? 'Tạm ngưng quyền giảng dạy' : 'Khôi phục quyền giảng dạy';
  const Icon = isManual ? Unlock : modal.type === 'suspend' ? PauseCircle : PlayCircle;
  return (
    <>
      <div className="cms-sheet-backdrop" onClick={onCancel} aria-hidden="true" />
      <div className="cms-sheet w-full md:max-w-md" role="dialog" aria-modal="true" aria-label={title}>
        <div className="cms-sheet-header">
          <span className="cms-sheet-header__side bg-sky-50 text-sky-600" aria-hidden="true"><Icon size={18} /></span>
          <h3 className="cms-sheet-header__title">{title}</h3>
          <button type="button" onClick={onCancel} className="cms-sheet-header__side bg-slate-50 text-slate-500" aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="cms-sheet-body space-y-4">
          <p className="text-sm text-slate-600">Giảng viên: <strong>{modal.name}</strong></p>
          {needsReason && (
            <label className="block text-sm font-semibold text-slate-700">
              {isManual ? 'Lý do cấp thủ công' : 'Lý do tạm ngưng'}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="cms-input mt-2 min-h-24 w-full resize-y"
                placeholder="Nhập lý do để lưu nhật ký quản trị..."
                autoFocus
              />
            </label>
          )}
          {!needsReason && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Phiên đăng nhập hiện tại của giảng viên sẽ bị vô hiệu hóa và cần đăng nhập lại sau khi hoạt động lại.</p>}
        </div>
        <div className="cms-sheet-footer">
          <button type="button" onClick={onCancel} className="cms-btn cms-btn-outline">Hủy</button>
          <button type="button" disabled={needsReason && reason.trim().length < 5} onClick={() => onConfirm(reason.trim())} className="cms-btn cms-btn-primary">
            <Icon size={16} /> Xác nhận
          </button>
        </div>
      </div>
    </>
  );
}
