/**
 * StaffPopup.jsx — Popup thông báo nội bộ cho Nhân viên
 * Chỉ hiện khi: role === 'staff' && staffPopup.isActive === true
 * Tránh spam: Lưu cờ sessionStorage khi đã đọc.
 * Hiện lại: Phiên mới hoặc Admin cập nhật nội dung (updatedAt thay đổi).
 */
import { useState, useEffect } from 'react';
import { X, Bell, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STORAGE_KEY = 'staff_popup_seen';

export default function StaffPopup({ session }) {
  const [popup, setPopup] = useState(null);
  const [show, setShow]   = useState(false);

  const isStaff = session?.role === 'staff' || session?.adminRole === 'STAFF';

  useEffect(() => {
    if (!isStaff) return;

    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (!res.success || !res.data?.staffPopup?.isActive) return;
        const sp = res.data.staffPopup;

        // Check if already seen this version
        const seenAt = sessionStorage.getItem(STORAGE_KEY);
        if (seenAt && seenAt === String(sp.updatedAt)) return; // Same version → don't show

        setPopup(sp);
        setShow(true);
      })
      .catch(() => {});
  }, [isStaff]);

  const handleClose = () => {
    setShow(false);
    // Mark as seen with updatedAt timestamp
    if (popup?.updatedAt) {
      sessionStorage.setItem(STORAGE_KEY, String(popup.updatedAt));
    }
  };

  if (!show || !popup) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 animate-in fade-in duration-300"
      onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Bell size={18} /> Thông báo nội bộ
          </h3>
          <button onClick={handleClose} className="text-white/70 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {popup.title && (
            <h4 className="text-lg font-black text-gray-800">{popup.title}</h4>
          )}
          {popup.content && (
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-xl p-4">
              {popup.content}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <AlertCircle size={12} />
            Thông báo này chỉ hiển thị một lần. Nội dung mới sẽ hiện lại khi Admin cập nhật.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button onClick={handleClose}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 transition shadow-lg shadow-amber-100 active:scale-[0.98]">
            ✓ Đã đọc, đóng thông báo
          </button>
        </div>
      </div>
    </div>
  );
}
