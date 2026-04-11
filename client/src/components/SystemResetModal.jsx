import React, { useState } from 'react';
import { AlertTriangle, Key, Loader2, RefreshCw } from 'lucide-react';

export default function SystemResetModal({ onClose, onSubmit }) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = phrase === 'XOA_DU_LIEU' && password.length >= 6;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    await onSubmit({ phrase, password });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-red-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[999]">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Header - Danger Zone */}
        <div className="bg-red-600 px-6 py-6 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-20"></div>
          <AlertTriangle size={48} className="mx-auto text-white mb-2 animate-pulse" />
          <h2 className="text-2xl font-black text-white uppercase tracking-wider relative z-10">
            CẢNH BÁO NGUY HIỂM CẤP ĐỘ 1
          </h2>
          <p className="text-red-100 text-xs font-medium uppercase mt-1">
            Hành động này không thể hoàn tác
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-800 leading-relaxed font-medium">
            Bạn đang yêu cầu <strong>LÀM MỚI TOÀN BỘ DỮ LIỆU HỆ THỐNG</strong>. 
            Mọi dữ liệu học viên, hóa đơn, bài tập, tin nhắn sẽ bị <strong className="text-red-600 underline">xóa vĩnh viễn</strong>. 
            Chỉ giữ lại danh sách Giảng viên, Khóa Học và Cơ Sở.
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
                1. Nhập mã xác nhận xóa
              </label>
              <input
                type="text"
                value={phrase}
                onChange={e => setPhrase(e.target.value)}
                placeholder="Gõ chính xác dãy: XOA_DU_LIEU"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-mono text-center font-bold outline-none focus:border-red-500 transition focus:bg-red-50"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
                2. Mật khẩu Super Admin
              </label>
              <div className="relative">
                <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu của bạn..."
                  className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-3 font-medium outline-none focus:border-red-500 transition focus:bg-red-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-8 py-5 flex gap-3">
          <button 
            type="button" 
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3.5 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition"
          >
            Hủy bỏ an toàn
          </button>
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`flex-1 py-3.5 rounded-xl font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${
              isValid
                ? 'bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-200/50 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {submitting ? 'ĐANG XÓA...' : 'Xác nhận xóa'}
          </button>
        </div>
      </div>
    </div>
  );
}
