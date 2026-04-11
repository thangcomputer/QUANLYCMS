import React, { useState } from 'react';
import { AlertTriangle, Key, Loader2, RefreshCw, Check, Users, DollarSign, Calendar, MessageSquare, ShieldAlert, FileText, CheckSquare, Square } from 'lucide-react';

export default function SystemResetModal({ onClose, onSubmit }) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Trạng thái chọn mục xóa
  const [options, setOptions] = useState({
    all: true,
    students: false,
    finance: false,
    schedules: false,
    communication: false,
    hr: false,
    logs: false,
  });

  const toggleOption = (key) => {
    if (key === 'all') {
      setOptions({ all: true, students: false, finance: false, schedules: false, communication: false, hr: false, logs: false });
    } else {
      setOptions(prev => ({
        ...prev,
        all: false,
        [key]: !prev[key]
      }));
    }
  };

  const isAnySelected = options.all || Object.values(options).some(v => v === true);
  const isValid = phrase === 'XOA_DU_LIEU' && password.length >= 6 && isAnySelected;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    await onSubmit({ phrase, password, options });
    setSubmitting(false);
  };

  const categories = [
    { key: 'students', label: 'Học viên & Thi', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'finance', label: 'Doanh thu & Lương', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'schedules', label: 'Lịch dạy & Điểm danh', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'communication', label: 'Tin nhắn & Thông báo', icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-50' },
    { key: 'hr', label: 'Dữ liệu Nhân sự (Staff)', icon: ShieldAlert, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'logs', label: 'Nhật ký hệ thống', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <div className="fixed inset-0 bg-red-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-white/20">
        
        {/* Header - Danger Zone */}
        <div className="bg-gradient-to-br from-red-600 to-red-700 px-6 py-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-20"></div>
          <AlertTriangle size={48} className="mx-auto text-white mb-2 animate-pulse relative z-10" />
          <h2 className="text-2xl font-black text-white uppercase tracking-[0.2em] relative z-10">
            TRUNG TÂM KIỂM SOÁT
          </h2>
          <p className="text-red-100 text-[10px] font-black uppercase mt-1 tracking-widest opacity-80 relative z-10">
            CẢNH BÁO NGUY HIỂM CẤP ĐỘ 1 • HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC
          </p>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Section 0: Selection */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">
              BƯỚC 1: CHỌN DỮ LIỆU MUỐN LÀM MỚI
            </label>
            
            <div className="grid grid-cols-2 gap-3 mt-4">
               <button 
                onClick={() => toggleOption('all')}
                className={`col-span-2 flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${options.all ? 'border-red-500 bg-red-50 ring-4 ring-red-50' : 'border-slate-100 hover:border-slate-200'}`}
               >
                 <div className="flex items-center gap-3">
                   <RefreshCw className={options.all ? 'text-red-600' : 'text-slate-400'} size={20} />
                   <div className="text-left">
                     <p className={`font-black text-sm ${options.all ? 'text-red-700' : 'text-slate-600'}`}>LÀM MỚI TẤT CẢ</p>
                     <p className="text-[10px] text-slate-400 font-bold">Xoá toàn bộ dữ liệu, đưa hệ thống về trạng thái sạch</p>
                   </div>
                 </div>
                 {options.all ? <CheckSquare className="text-red-600" size={24} /> : <Square className="text-slate-200" size={24} />}
               </button>

               {categories.map(cat => (
                 <button 
                  key={cat.key}
                  onClick={() => toggleOption(cat.key)}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${options[cat.key] ? 'border-amber-500 bg-amber-50 ring-4 ring-amber-50' : 'border-slate-50 hover:border-slate-100 bg-slate-50/50'}`}
                 >
                   <cat.icon className={options[cat.key] ? cat.color : 'text-slate-400'} size={18} />
                   <span className={`text-[11px] font-black uppercase text-left tracking-tight ${options[cat.key] ? 'text-slate-800' : 'text-slate-400'}`}>
                     {cat.label}
                   </span>
                   <div className="ml-auto">
                    {options[cat.key] ? <CheckSquare className="text-amber-600" size={18} /> : <Square className="text-slate-200" size={18} />}
                   </div>
                 </button>
               ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                BƯỚC 2: XÁC THỰC DANH TÍNH SUPER ADMIN
              </label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={phrase}
                  onChange={e => setPhrase(e.target.value)}
                  placeholder="Gõ chính xác: XOA_DU_LIEU"
                  className="w-full border-2 border-slate-100 rounded-2xl px-4 py-4 font-mono text-center font-black outline-none focus:border-red-500 transition focus:bg-red-50 text-slate-700 placeholder:text-slate-300"
                />
                
                <div className="relative">
                  <Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu Super Admin..."
                    className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 font-black outline-none focus:border-red-500 transition focus:bg-red-50 text-slate-700 placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-8 py-6 flex gap-4 border-t border-slate-100">
          <button 
            type="button" 
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-200 transition text-xs uppercase tracking-widest"
          >
            Hủy bỏ an toàn
          </button>
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`flex-[1.5] py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex justify-center items-center gap-2 transition-all duration-300 ${
              isValid
                ? 'bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-200 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {submitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN KÍCH HOẠT XÓA'}
          </button>
        </div>
      </div>
    </div>
  );
}
