/**
 * SystemSettingsTab.jsx
 * Trang Cài đặt hệ thống cho Admin — 3 tab:
 *  1. Tài khoản thu học phí (ngân hàng trung tâm)
 *  2. Quản lý Popup thông báo
 *  3. Học phí Khóa học (Price catalog)
 */


import { useState, useEffect, useRef } from 'react';
import {
  Settings, CreditCard, Bell, Save, Loader2, Eye,
  Upload, Users, GraduationCap, ToggleLeft,
  ToggleRight, AlertCircle, Landmark, X,
  DollarSign, Building2, Lock, User, KeyRound, EyeOff, CheckCircle2, FileText
} from 'lucide-react';
import { BankSelect } from './BankSelect';
import api from '../services/api';
import { useToast } from '../utils/toast';
import CoursePricingTab from './CoursePricingTab';
import BranchManagementTab from './BranchManagementTab';
import WebSettingsTab from './WebSettingsTab';
import SystemResetModal from './SystemResetModal';
import { AlertOctagon } from 'lucide-react';

// ── Tuition QR Preview ────────────────────────────────────────────────────────
function TuitionQRPreview({ settings }) {
  const { centerBankCode, centerBankAccountNumber, centerBankAccountName } = settings;
  if (!centerBankCode || !centerBankAccountNumber) return null;
  const params = new URLSearchParams({
    amount: '500000',
    addInfo: 'HV001 Nop hoc phi THVP',
    accountName: centerBankAccountName || '',
  });
  const url = `https://img.vietqr.io/image/${centerBankCode}-${centerBankAccountNumber}-compact2.png?${params}`;
  return (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
      <p className="text-xs font-bold text-blue-600 uppercase mb-2 flex items-center gap-1">
        <Eye size={12} /> Xem thử mã QR thu học phí (500.000đ mẫu)
      </p>
      <div className="flex justify-center">
        <img src={url} alt="QR mẫu" className="w-40 h-40 object-contain rounded-xl border bg-white p-1" />
      </div>
    </div>
  );
}

export default function SystemSettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState('bank');
  const [loading, setLoading]   = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInputRef = useRef(null);

  // ── Admin Profile State ──
  const [adminName, setAdminName] = useState('');
  const [adminOldPw, setAdminOldPw] = useState('');
  const [adminNewPw, setAdminNewPw] = useState('');
  const [adminNewPw2, setAdminNewPw2] = useState('');
  const [showAdminOldPw, setShowAdminOldPw] = useState(false);
  const [showAdminNewPw, setShowAdminNewPw] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSuccess, setAdminSuccess] = useState('');
  const toast = useToast();

  const [settings, setSettings] = useState({
    // Bank
    centerBankCode: '',
    centerBankName: '',
    centerBankAccountNumber: '',
    centerBankAccountName: '',
    // Popup
    popupIsActive: false,
    popupTitle: '',
    popupContent: '',
    popupImageUrl: '',
    popupTargetRole: 'all',
    // Invoice
    invoiceLogoUrl: '',
    invoiceSignatureUrl: '',
    invoiceStampText: 'ĐÃ THANH TOÁN',
  });

  // Fetch current settings
  useEffect(() => {
    setLoading(true);
    api.settings.getAll()
      .then(res => {
        if (res.success) setSettings(prev => ({ ...prev, ...res.data }));
      })
      .catch(() => toast.error('Không tải được cấu hình'))
      .finally(() => setLoading(false));
  }, []);


  const handleSave = async (fields) => {
    const payload = {};
    for (const f of fields) payload[f] = settings[f];
    setSaving(true);
    try {
      const res = await api.settings.update(payload);
      if (res.success) {
        toast.success('✅ Đã lưu cấu hình thành công');
        setSettings(prev => ({ ...prev, ...res.data }));
      } else {
        toast.error(res.message || 'Lưu thất bại');
      }
    } catch {
      toast.error('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.settings.uploadPopupImage(file);
      if (res.success) {
        setSettings(prev => ({ ...prev, popupImageUrl: res.imageUrl }));
        toast.success('✅ Upload ảnh thành công');
      } else {
        toast.error(res.message || 'Upload thất bại');
      }
    } catch {
      toast.error('Lỗi upload ảnh');
    } finally {
      setUploading(false);
    }
  };

  const handleResetData = async (data) => {
    try {
      const res = await api.settings.resetData(data);
      if (res.success) {
         toast.success('Hệ thống đã được dọn dẹp sạch sẽ!');
         // Frontend tự động reload để clear trạng thái cũ
         setTimeout(() => {
           localStorage.clear();
           sessionStorage.clear();
           window.location.href = '/login';
         }, 1500);
      } else {
         toast.error(res.message || 'Lỗi khi đặt lại dữ liệu');
      }
    } catch (err) {
      toast.error('Có lỗi xảy ra, thử lại sau');
    }
  };

  const handleSignatureUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.settings.uploadInvoiceSignature(file);
      if (res.success) {
        setSettings(prev => ({ ...prev, invoiceSignatureUrl: res.signatureUrl }));
        toast.success('✅ Cập nhật chữ ký thành công');
      } else {
        toast.error(res.message || 'Upload thất bại');
      }
    } catch {
      toast.error('Lỗi upload chữ ký');
    } finally {
      setUploading(false);
    }
  };

  const handleInvoiceLogoUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.settings.uploadInvoiceLogo(file);
      if (res.success) {
        setSettings(prev => ({ ...prev, invoiceLogoUrl: res.logoUrl }));
        toast.success('✅ Cập nhật logo hóa đơn thành công');
      } else {
        toast.error(res.message || 'Upload thất bại');
      }
    } catch {
      toast.error('Lỗi upload logo');
    } finally {
      setUploading(false);
    }
  };

  // ── Admin Profile Handler ──
  const handleAdminProfileSave = async () => {
    if (adminNewPw && adminNewPw !== adminNewPw2) {
      toast.error('Mật khẩu mới không khớp nhau');
      return;
    }
    if (adminNewPw && adminNewPw.length < 6) {
      toast.error('Mật khẩu mới phải ít nhất 6 ký tự');
      return;
    }
    if (adminNewPw && !adminOldPw) {
      toast.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    setAdminSaving(true);
    setAdminSuccess('');
    try {
      const payload = {};
      if (adminName.trim()) payload.name = adminName.trim();
      if (adminNewPw) {
        payload.oldPassword = adminOldPw;
        payload.newPassword = adminNewPw;
      }
      if (!payload.name && !payload.newPassword) {
        toast.error('Vui lòng nhập thông tin cần thay đổi');
        setAdminSaving(false);
        return;
      }
      const res = await api.auth.adminUpdateProfile(payload);
      if (res.success) {
        toast.success('✅ Cập nhật thành công!');
        setAdminSuccess('Thông tin đã được cập nhật thành công!');
        setAdminOldPw('');
        setAdminNewPw('');
        setAdminNewPw2('');
        // Update session name
        if (res.data?.name) {
          try {
            const session = JSON.parse(localStorage.getItem('admin_user') || '{}');
            session.name = res.data.name;
            localStorage.setItem('admin_user', JSON.stringify(session));
          } catch {}
        }
      } else {
        toast.error(res.message || 'Cập nhật thất bại');
      }
    } catch {
      toast.error('Lỗi kết nối server');
    } finally {
      setAdminSaving(false);
    }
  };

  const TABS = [
    { key: 'bank',     label: 'Tài khoản Thu học phí', icon: CreditCard  },
    { key: 'pricing',  label: 'Học phí Khóa học',       icon: DollarSign  },
    { key: 'branches', label: 'Chi nhánh / Cơ sở',      icon: Building2   },
    { key: 'popup',    label: 'Popup Thông báo',         icon: Bell        },
    { key: 'invoice',  label: 'Hóa đơn (Invoice)',       icon: FileText    },
    { key: 'web',      label: 'Cài đặt Web',             icon: Settings    },
    { key: 'account',  label: 'Tài khoản Admin',         icon: Lock        },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-500">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <span>Đang tải cấu hình...</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <Settings size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Cài đặt hệ thống</h2>
            <p className="text-xs text-gray-400">Cấu hình ngân hàng trung tâm và thông báo hiển thị</p>
          </div>
        </div>
        
        {/* DANGER ZONE BUTTON */}
        <button 
          onClick={() => setShowResetModal(true)}
          className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 shadow-sm relative group overflow-hidden"
        >
           <span className="absolute inset-0 bg-red-600 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300"></span>
           <AlertOctagon size={16} className="relative z-10" /> 
           <span className="relative z-10">Làm mới dữ liệu hệ thống</span>
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-gray-100 pb-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSubTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition border-b-2 ${
              activeSubTab === t.key
                ? 'text-violet-700 border-violet-600 bg-violet-50'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: NGÂN HÀNG ───────────────────────────────────────────── */}
      {activeSubTab === 'bank' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={16} className="text-emerald-600" />
            <h3 className="font-bold text-gray-800">Tài khoản ngân hàng thu học phí</h3>
          </div>
          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-xl p-3">
            💡 Đây là tài khoản ngân hàng của <strong>Trung tâm</strong> dùng để Học viên chuyển học phí. Mã QR sẽ tự động tạo từ thông tin này khi Admin bấm "Thu tiền".
          </p>

          {/* Bank Select */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Ngân hàng</label>
            <BankSelect
              value={settings.centerBankCode}
              onChange={bank => setSettings(prev => ({
                ...prev,
                centerBankCode: bank.bin,
                centerBankName: bank.shortName,
              }))}
            />
            {settings.centerBankCode && (
              <p className="text-[11px] text-emerald-600 mt-1">✓ {settings.centerBankName} (BIN: {settings.centerBankCode})</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Số tài khoản</label>
            <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 transition">
              <CreditCard size={15} className="text-emerald-500 flex-shrink-0" />
              <input
                type="text"
                value={settings.centerBankAccountNumber}
                onChange={e => setSettings(prev => ({ ...prev, centerBankAccountNumber: e.target.value.replace(/\D/g,'') }))}
                className="flex-1 text-sm font-mono outline-none bg-transparent tracking-wider"
                placeholder="Nhập số tài khoản"
                maxLength={20}
              />
            </div>
          </div>

          {/* Account Name */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Tên chủ tài khoản</label>
            <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-emerald-400 transition">
              <Users size={15} className="text-emerald-500 flex-shrink-0" />
              <input
                type="text"
                value={settings.centerBankAccountName}
                onChange={e => setSettings(prev => ({ ...prev, centerBankAccountName: e.target.value.toUpperCase() }))}
                className="flex-1 text-sm font-bold outline-none bg-transparent uppercase"
                placeholder="VD: THANG TIN HOC CENTER"
              />
            </div>
          </div>

          {/* QR Preview */}
          <TuitionQRPreview settings={settings} />

          <button
            onClick={() => handleSave(['centerBankCode','centerBankName','centerBankAccountNumber','centerBankAccountName'])}
            disabled={saving || !settings.centerBankCode || !settings.centerBankAccountNumber}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-700 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-100"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Đang lưu...' : 'Lưu cấu hình ngân hàng'}
          </button>
        </div>
      )}


      {/* ── TAB 2: HỌC PHÍ KHÓA HỌC ── CoursePricingTab component ───────────────── */}
      {activeSubTab === 'pricing' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <CoursePricingTab />
        </div>
      )}

      {/* ── TAB 3: CHI NHÁNH ──────────────────────────────────────────────────── */}
      {activeSubTab === 'branches' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <BranchManagementTab />
        </div>
      )}

      {activeSubTab === 'popup' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-violet-600" />
              <h3 className="font-bold text-gray-800">Popup thông báo / quảng cáo</h3>
            </div>
            {/* Toggle bật/tắt */}
            <button
              onClick={() => setSettings(prev => ({ ...prev, popupIsActive: !prev.popupIsActive }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition ${
                settings.popupIsActive
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {settings.popupIsActive
                ? <><ToggleRight size={20} className="text-emerald-600" /> Đang bật</>
                : <><ToggleLeft size={20} /> Đang tắt</>
              }
            </button>
          </div>

          {!settings.popupIsActive && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2 text-sm text-gray-500">
              <AlertCircle size={14} />
              Popup đang tắt — Học viên/Giảng viên sẽ không thấy popup khi đăng nhập.
            </div>
          )}

          {/* Target Role */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Đối tượng hiển thị</label>
            <div className="flex gap-3">
              {[
                { v: 'all',     label: 'Tất cả',    Icon: Users },
                { v: 'student', label: 'Học viên',   Icon: Users },
                { v: 'teacher', label: 'Giảng viên', Icon: GraduationCap },
              ].map(({ v, label, Icon }) => (
                <button
                  key={v}
                  onClick={() => setSettings(prev => ({ ...prev, popupTargetRole: v }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition border-2 ${
                    settings.popupTargetRole === v
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Tiêu đề popup</label>
            <input
              type="text"
              value={settings.popupTitle}
              onChange={e => setSettings(prev => ({ ...prev, popupTitle: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-violet-400 outline-none transition"
              placeholder="VD: 🎉 Thông báo lịch học tháng 4"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Nội dung thông báo</label>
            <textarea
              value={settings.popupContent}
              onChange={e => setSettings(prev => ({ ...prev, popupContent: e.target.value }))}
              rows={4}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-violet-400 outline-none resize-none transition"
              placeholder="Nhập nội dung thông báo..."
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Ảnh banner (tùy chọn)</label>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleImageUpload(e.target.files?.[0])}
            />
            <div className="space-y-2">
              <button
                onClick={() => imgInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-violet-300 rounded-xl py-4 text-violet-600 hover:bg-violet-50 flex items-center justify-center gap-2 font-medium text-sm transition disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Đang upload...' : 'Chọn ảnh banner'}
              </button>

              {settings.popupImageUrl && (
                <div className="relative">
                  <img
                    src={settings.popupImageUrl.startsWith('http')
                      ? settings.popupImageUrl
                      : `${import.meta.env.VITE_API_URL || ""}${settings.popupImageUrl}`}
                    alt="Banner preview"
                    className="w-full rounded-xl border max-h-48 object-cover"
                  />
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, popupImageUrl: '' }))}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full text-white flex items-center justify-center hover:bg-black/70"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* URL input thay thế */}
              <input
                type="url"
                value={settings.popupImageUrl}
                onChange={e => setSettings(prev => ({ ...prev, popupImageUrl: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-violet-400 outline-none transition"
                placeholder="Hoặc nhập URL ảnh trực tiếp..."
              />
            </div>
          </div>

          <button
            onClick={() => handleSave(['popupIsActive','popupTitle','popupContent','popupImageUrl','popupTargetRole'])}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-700 flex items-center justify-center gap-2 disabled:opacity-40 transition shadow-lg shadow-violet-100"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Đang lưu...' : 'Lưu cấu hình Popup'}
          </button>
        </div>
      )}

      {/* ── TAB: HÓA ĐƠN (INVOICE) ────────────────────────────────────────── */}
      {activeSubTab === 'invoice' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6 max-w-2xl">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <h3 className="font-bold text-gray-800">Cấu hình Hóa đơn (Phiếu thu)</h3>
          </div>
          
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl p-3">
            💡 Tùy chỉnh Logo, Chữ ký và dấu mộc hiển thị trên hóa đơn (khổ A5) của Trung tâm.
          </p>

          {/* Logo Hóa đơn */}
          <div className="space-y-3">
             <label className="text-xs font-bold text-gray-500 uppercase block">Logo trên hóa đơn</label>
             <div className="flex items-center gap-4">
               {settings.invoiceLogoUrl && (
                 <img 
                    src={settings.invoiceLogoUrl.startsWith('http') ? settings.invoiceLogoUrl : `${import.meta.env.VITE_API_URL || ""}${settings.invoiceLogoUrl}`} 
                    className="h-16 w-16 object-contain border rounded-lg bg-gray-50" 
                    alt="Logo Invoice"
                 />
               )}
               <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => handleInvoiceLogoUpload(e.target.files[0]);
                    input.click();
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition flex items-center gap-2"
               >
                 <Upload size={14} /> {settings.invoiceLogoUrl ? 'Thay đổi Logo' : 'Tải lên Logo'}
               </button>
             </div>
          </div>

          {/* Chữ ký */}
          <div className="space-y-3">
             <label className="text-xs font-bold text-gray-500 uppercase block">Chữ ký người nhận tiền</label>
             <div className="flex items-center gap-4">
               {settings.invoiceSignatureUrl && (
                 <img 
                    src={settings.invoiceSignatureUrl.startsWith('http') ? settings.invoiceSignatureUrl : `${import.meta.env.VITE_API_URL || ""}${settings.invoiceSignatureUrl}`} 
                    className="h-16 w-32 object-contain border rounded-lg bg-gray-50" 
                    alt="Chữ ký"
                 />
               )}
               <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => handleSignatureUpload(e.target.files[0]);
                    input.click();
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition flex items-center gap-2"
               >
                 <Upload size={14} /> {settings.invoiceSignatureUrl ? 'Thay đổi Chữ ký' : 'Tải lên Chữ ký'}
               </button>
             </div>
             <p className="text-[10px] text-gray-400 italic">Gợi ý: Sử dụng ảnh nền trong suốt (PNG) để hiển thị đẹp nhất.</p>
          </div>

          {/* Dấu mộc (Stamp) */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Nội dung dấu mộc (Stamp)</label>
            <input
              type="text"
              value={settings.invoiceStampText}
              onChange={e => setSettings(prev => ({ ...prev, invoiceStampText: e.target.value.toUpperCase() }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-red-600 focus:border-red-400 outline-none transition"
              placeholder="VD: ĐÃ THANH TOÁN"
            />
          </div>

          <button
            onClick={() => handleSave(['invoiceLogoUrl', 'invoiceSignatureUrl', 'invoiceStampText'])}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 flex items-center justify-center gap-2 disabled:opacity-40 transition shadow-lg shadow-blue-100"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Đang lưu...' : 'Lưu cấu hình Hóa đơn'}
          </button>
        </div>
      )}
      {/* ── TAB 5: CÀI ĐẶT WEB ── WebSettingsTab component ──────────────────── */}
      {activeSubTab === 'web' && (
        <WebSettingsTab />
      )}

      {/* ── TAB 6: TÀI KHOẢN ADMIN ──────────────────────────────────────────── */}
      {activeSubTab === 'account' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} className="text-violet-600" />
            <h3 className="font-bold text-gray-800">Thay đổi thông tin Admin</h3>
          </div>
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl p-3">
            🔐 Thay đổi tên hiển thị và mật khẩu đăng nhập của tài khoản Admin.
          </p>

          {adminSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-700 text-sm font-bold">
              <CheckCircle2 size={16} /> {adminSuccess}
            </div>
          )}

          {/* Tên hiển thị */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Tên hiển thị mới (tùy chọn)</label>
            <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-violet-400 transition">
              <User size={15} className="text-violet-500 flex-shrink-0" />
              <input
                type="text"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                className="flex-1 text-sm font-bold outline-none bg-transparent"
                placeholder="Nhập tên hiển thị mới..."
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-1"><KeyRound size={12} /> Đổi mật khẩu (tùy chọn)</p>

            {/* Mật khẩu hiện tại */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Mật khẩu hiện tại</label>
                <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-violet-400 transition">
                  <Lock size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type={showAdminOldPw ? 'text' : 'password'}
                    value={adminOldPw}
                    onChange={e => setAdminOldPw(e.target.value)}
                    className="flex-1 text-sm font-bold outline-none bg-transparent"
                    placeholder="Nhập mật khẩu hiện tại..."
                  />
                  <button type="button" onClick={() => setShowAdminOldPw(!showAdminOldPw)} className="text-gray-400 hover:text-gray-600">
                    {showAdminOldPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Mật khẩu mới */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Mật khẩu mới (ít nhất 6 ký tự)</label>
                <div className="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-violet-400 transition">
                  <KeyRound size={15} className="text-violet-500 flex-shrink-0" />
                  <input
                    type={showAdminNewPw ? 'text' : 'password'}
                    value={adminNewPw}
                    onChange={e => setAdminNewPw(e.target.value)}
                    className="flex-1 text-sm font-bold outline-none bg-transparent"
                    placeholder="Nhập mật khẩu mới..."
                  />
                  <button type="button" onClick={() => setShowAdminNewPw(!showAdminNewPw)} className="text-gray-400 hover:text-gray-600">
                    {showAdminNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Xác nhận mật khẩu mới */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Xác nhận mật khẩu mới</label>
                <div className={`flex items-center gap-2 bg-white border-2 rounded-xl px-4 py-3 transition ${
                  adminNewPw2 && adminNewPw !== adminNewPw2 ? 'border-red-300' : 'border-gray-200 focus-within:border-violet-400'
                }`}>
                  <KeyRound size={15} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="password"
                    value={adminNewPw2}
                    onChange={e => setAdminNewPw2(e.target.value)}
                    className="flex-1 text-sm font-bold outline-none bg-transparent"
                    placeholder="Nhập lại mật khẩu mới..."
                  />
                  {adminNewPw2 && adminNewPw === adminNewPw2 && (
                    <CheckCircle2 size={15} className="text-emerald-500" />
                  )}
                </div>
                {adminNewPw2 && adminNewPw !== adminNewPw2 && (
                  <p className="text-xs text-red-500 mt-1 ml-1">Mật khẩu xác nhận không khớp</p>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleAdminProfileSave}
            disabled={adminSaving || (adminNewPw && adminNewPw !== adminNewPw2)}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-700 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-violet-100"
          >
            {adminSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {adminSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      )}

      {/* DANGER ZONE MODAL */}
      {showResetModal && (
        <SystemResetModal 
          onClose={() => setShowResetModal(false)}
          onSubmit={handleResetData}
        />
      )}
    </div>
  );
}
