/**
 * WebSettingsTab.jsx — Cài đặt Web (Logo, Loading Screen, Staff Popup)
 * Chỉ Super Admin truy cập. Nằm trong SystemSettingsTab.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Globe, Upload, Loader2, Save, Image, Monitor, MessageSquare,
  ToggleLeft, ToggleRight, AlertCircle, Check, X, Eye
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");

function getToken() {
  for (const role of ['admin','staff']) {
    const directToken = localStorage.getItem(`${role}_access_token`);
    if (directToken) return directToken;
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

// ── Loading Preview Mini ─────────────────────────────────────────────────────
function LoadingPreview({ style }) {
  const previewStyles = {
    1: (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-3 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    ),
    2: (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse shadow-lg" />
      </div>
    ),
    3: (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs font-mono text-gray-600 typing-text">Đang tải...</p>
      </div>
    ),
    4: (
      <div className="flex items-center justify-center h-full" style={{ perspective: '200px' }}>
        <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg shadow-lg"
          style={{ animation: 'cube3d 2s infinite linear', transformStyle: 'preserve-3d' }} />
      </div>
    ),
  };
  return previewStyles[style] || previewStyles[1];
}

export default function WebSettingsTab() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef(null);

  const [config, setConfig] = useState({
    logoUrl: '',
    loadingStyle: 1,
    staffPopup: { isActive: false, title: '', content: '' },
  });

  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch web settings
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setConfig(prev => ({
            ...prev,
            logoUrl: res.data.logoUrl || '',
            loadingStyle: res.data.loadingStyle || 1,
            staffPopup: {
              isActive: res.data.staffPopup?.isActive || false,
              title: res.data.staffPopup?.title || '',
              content: res.data.staffPopup?.content || '',
            },
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Upload logo
  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`${API}/api/settings/upload-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      }).then(r => r.json());
      if (res.success) {
        setConfig(prev => ({ ...prev, logoUrl: res.logoUrl }));
      }
    } catch {}
    finally { setUploading(false); }
  };

  // Save all web settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/settings/web`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).then(r => r.json());
      if (res.success) {
        // Trigger global reload of web settings
        window.dispatchEvent(new Event('web-settings-changed'));
      }
    } catch {}
    finally { setSaving(false); }
  };

  // Preview loading effect
  const handlePreview = () => {
    setPreviewLoading(true);
    setTimeout(() => setPreviewLoading(false), 3000);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin" /> Đang tải cấu hình...
    </div>
  );

  const LOADING_STYLES = [
    { id: 1, name: 'Tối giản',    desc: 'Vòng xoay vệt sáng gradient',     emoji: '⭕' },
    { id: 2, name: 'Thương hiệu', desc: 'Logo nhịp đập (Pulse Effect)',     emoji: '💓' },
    { id: 3, name: 'Giáo dục',    desc: 'Hiệu ứng gõ chữ (Typewriter)',    emoji: '⌨️' },
    { id: 4, name: 'Công nghệ',   desc: 'Khối 3D xoay lơ lửng',           emoji: '🧊' },
  ];

  return (
    <div className="space-y-8">
      <style>{`
        @keyframes cube3d {
          0%   { transform: rotateX(0deg) rotateY(0deg); }
          25%  { transform: rotateX(90deg) rotateY(0deg); }
          50%  { transform: rotateX(90deg) rotateY(90deg); }
          75%  { transform: rotateX(0deg) rotateY(90deg); }
          100% { transform: rotateX(0deg) rotateY(0deg); }
        }
        .typing-text {
          overflow: hidden;
          white-space: nowrap;
          border-right: 2px solid #666;
          animation: typing 2s steps(12) infinite, blink 0.5s step-end infinite alternate;
          width: 0;
          max-width: 80px;
        }
        @keyframes typing { 0% { width: 0; } 50% { width: 80px; } 100% { width: 0; } }
        @keyframes blink { 50% { border-color: transparent; } }
      `}</style>

      {/* ══════════════ PHẦN 1: LOGO ══════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Image size={16} className="text-blue-600" />
          <h3 className="font-bold text-gray-800">Logo thương hiệu</h3>
        </div>
        <p className="text-xs text-gray-400">
          Logo hiển thị trên: Sidebar, Trang đăng nhập Public, Trang đăng nhập Admin.
        </p>

        <div className="flex items-start gap-6">
          {/* Preview */}
          <div className="w-32 h-32 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {config.logoUrl ? (
              <img
                src={config.logoUrl.startsWith('http') ? config.logoUrl : `${API}${config.logoUrl}`}
                alt="Logo"
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <div className="text-center text-gray-300">
                <Image size={28} className="mx-auto mb-1" />
                <p className="text-[10px]">Chưa có logo</p>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div className="flex-1 space-y-3">
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleLogoUpload(e.target.files?.[0])} />
            <button onClick={() => logoInputRef.current?.click()} disabled={uploading}
              className="w-full border-2 border-dashed border-blue-300 rounded-xl py-3 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2 font-medium text-sm transition disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Đang upload...' : 'Tải ảnh logo lên'}
            </button>

            {/* URL fallback */}
            <input type="url" value={config.logoUrl}
              onChange={e => setConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:border-blue-400 outline-none"
              placeholder="Hoặc nhập URL logo trực tiếp..." />

            {config.logoUrl && (
              <button onClick={() => setConfig(prev => ({ ...prev, logoUrl: '' }))}
                className="text-xs text-red-500 hover:underline flex items-center gap-1">
                <X size={12} /> Xóa logo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════ PHẦN 2: LOADING SCREEN ══════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-purple-600" />
            <h3 className="font-bold text-gray-800">Hiệu ứng Loading</h3>
          </div>
          <button onClick={handlePreview}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-100 transition">
            <Eye size={13} /> Xem trước 3s
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Chọn 1 trong 4 kiểu loading hiển thị khi khởi động hệ thống.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LOADING_STYLES.map(ls => (
            <button key={ls.id}
              onClick={() => setConfig(prev => ({ ...prev, loadingStyle: ls.id }))}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                config.loadingStyle === ls.id
                  ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {config.loadingStyle === ls.id && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
              <div className="w-full h-20 bg-gray-50 rounded-xl mb-3 overflow-hidden">
                <LoadingPreview style={ls.id} />
              </div>
              <p className="text-xs font-black text-gray-700">{ls.emoji} {ls.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{ls.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ PHẦN 3: STAFF POPUP ══════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-amber-600" />
            <h3 className="font-bold text-gray-800">Thông báo Nhân viên (Staff Popup)</h3>
          </div>
          <button
            onClick={() => setConfig(prev => ({
              ...prev,
              staffPopup: { ...prev.staffPopup, isActive: !prev.staffPopup.isActive },
            }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition ${
              config.staffPopup.isActive
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {config.staffPopup.isActive
              ? <><ToggleRight size={20} className="text-emerald-600" /> Đang bật</>
              : <><ToggleLeft size={20} /> Đang tắt</>
            }
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Popup này chỉ hiện cho <strong>nhân viên chi nhánh (Staff)</strong> khi đăng nhập. Tự ẩn sau khi đọc, chỉ hiện lại khi bạn cập nhật nội dung mới.
        </p>

        {!config.staffPopup.isActive && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2 text-sm text-gray-500">
            <AlertCircle size={14} /> Popup đang tắt — Nhân viên sẽ không thấy thông báo.
          </div>
        )}

        {/* Title */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Tiêu đề</label>
          <input type="text"
            value={config.staffPopup.title}
            onChange={e => setConfig(prev => ({
              ...prev,
              staffPopup: { ...prev.staffPopup, title: e.target.value },
            }))}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-amber-400 outline-none transition"
            placeholder="VD: 📢 Thông báo nội bộ tháng 4" />
        </div>

        {/* Content */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Nội dung thông báo</label>
          <textarea
            value={config.staffPopup.content}
            onChange={e => setConfig(prev => ({
              ...prev,
              staffPopup: { ...prev.staffPopup, content: e.target.value },
            }))}
            rows={5}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-amber-400 outline-none resize-none transition"
            placeholder="Nhập nội dung thông báo cho nhân viên..." />
        </div>
      </div>

      {/* ══════════════ NÚT LƯU ══════════════ */}
      <button onClick={handleSave} disabled={saving}
        className="w-full max-w-2xl py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:from-indigo-700 flex items-center justify-center gap-2 disabled:opacity-40 transition shadow-lg shadow-indigo-100">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'Đang lưu...' : 'Lưu toàn bộ cài đặt Web'}
      </button>

      {/* ══════════════ MODAL PREVIEW LOADING ══════════════ */}
      {previewLoading && (
        <div className="fixed inset-0 bg-gray-900/90 flex flex-col items-center justify-center z-[200] animate-in fade-in duration-300"
          onClick={() => setPreviewLoading(false)}>
          <div className="mb-6 transform scale-150">
            <LoadingPreview style={config.loadingStyle} />
          </div>
          <p className="text-white/60 text-sm mt-4">Nhấn bất kỳ để đóng</p>
          <p className="text-white/30 text-xs mt-1">Kiểu {config.loadingStyle}: {LOADING_STYLES[config.loadingStyle - 1]?.name}</p>
        </div>
      )}
    </div>
  );
}
