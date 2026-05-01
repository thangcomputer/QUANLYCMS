/**
 * PopupBanner.jsx
 *
 * Popup thông báo/quảng cáo hiện sau khi đăng nhập.
 * - Gọi API /api/settings/popup để lấy config
 * - Kiểm tra role match
 * - Dùng sessionStorage để chỉ hiện 1 lần/phiên đăng nhập
 * - Backdrop blur + nút X to rõ ràng
 *
 * Usage:
 *   <PopupBanner role="student" />
 *   <PopupBanner role="teacher" />
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../services/api';

const SESSION_KEY = 'cms_popup_seen_';

export default function PopupBanner({ role }) {
  const [popup, setPopup] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const storageKey = `${SESSION_KEY}${role}_${today}`;

    // Nếu đã xem hôm nay rồi → không hiện lại
    if (sessionStorage.getItem(storageKey)) return;

    api.settings.getPopup()
      .then(res => {
        if (!res.success) return;
        const { isActive, targetRole, title, content, imageUrl } = res.data;

        // Kiểm tra bật/tắt và role match
        if (!isActive) return;
        if (targetRole !== 'all' && targetRole !== role) return;

        // Không có nội dung gì cả → không hiện
        if (!title && !content && !imageUrl) return;

        setPopup({ title, content, imageUrl });
        setVisible(true);
      })
      .catch(() => {}); // silent fail
  }, [role]);

  const handleClose = () => {
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `${SESSION_KEY}${role}_${today}`;
    sessionStorage.setItem(storageKey, '1');
    setVisible(false);
  };

  if (!visible || !popup) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Nút X — to, rõ, dễ bấm */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition shadow-lg"
          title="Đóng thông báo"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* Ảnh banner (nếu có) */}
        {popup.imageUrl && (
          <div className="w-full flex-shrink-0">
            <img
              src={popup.imageUrl.startsWith('http') ? popup.imageUrl : `${import.meta.env.VITE_API_URL || ""}${popup.imageUrl}`}
              alt="Thông báo"
              className="w-full object-cover"
              style={{ maxHeight: '280px' }}
            />
          </div>
        )}

        {/* Nội dung (nếu có) */}
        {(popup.title || popup.content) && (
          <div className="p-6 flex-1 overflow-y-auto">
            {popup.title && (
              <h2 className="text-xl font-black text-gray-900 mb-3 leading-tight">
                {popup.title}
              </h2>
            )}
            {popup.content && (
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                {popup.content}
              </p>
            )}
          </div>
        )}

        {/* Footer button */}
        <div className="px-6 pb-5 pt-2 flex-shrink-0">
          <button
            onClick={handleClose}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl hover:from-blue-700 transition shadow-lg shadow-blue-100"
          >
            Đã hiểu, đóng thông báo ✓
          </button>
        </div>
      </div>
    </div>
  );
}
