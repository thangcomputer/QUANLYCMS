/**
 * StaffManagementTab.jsx
 * Quản lý Tài khoản & Phân quyền Nhân viên nội bộ
 *
 * Chỉ hiển thị trong Admin Sidebar khi user.adminRole === 'SUPER_ADMIN'
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, UserPlus, Edit2, Trash2, Save, X, Loader2,
  CheckSquare, Square, Key, Phone, User, Shield, Users,
  AlertTriangle, CheckCircle2, Crown, UserCog, Building2
} from 'lucide-react';
import { useToast } from '../utils/toast';
import { useModal } from '../utils/Modal.jsx';
import { ALL_PERMISSIONS } from '../constants/permissions';

const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");



function getToken() {
  for (const role of ['admin','staff','teacher']) {
    const directToken = localStorage.getItem(`${role}_access_token`);
    if (directToken) return directToken;
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

// ── Badge phân quyền ──────────────────────────────────────────────────────────
function RoleBadge({ adminRole }) {
  if (adminRole === 'SUPER_ADMIN') {
    return (
      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full">
        <Crown size={10} /> SUPER ADMIN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-full">
      <UserCog size={10} /> STAFF
    </span>
  );
}

// ── Modal Thêm/Sửa ────────────────────────────────────────────────────────────
function StaffModal({ staff, onClose, onSaved }) {
  const toast  = useToast();
  const isEdit = !!staff?._id;

  const [branches, setBranches]   = useState([]);
  const [branchLoading, setBranchLoading] = useState(true);

  const [form, setForm] = useState({
    name:        staff?.name || '',
    phone:       staff?.phone || '',
    password:    '',
    adminRole:   staff?.adminRole || 'STAFF',
    permissions: staff?.permissions || [],
    branchId:    staff?.branchId || '',
    status:      staff?.status || 'active',
  });
  const [saving, setSaving] = useState(false);

  // Fetch danh sách chi nhánh khi mở modal
  useEffect(() => {
    setBranchLoading(true);
    fetch(`${API}/api/branches/all`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setBranches(res.data || []); })
      .catch(() => {})
      .finally(() => setBranchLoading(false));
  }, []);

  const togglePerm = (key) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Vui lòng nhập đủ Tên và Số điện thoại'); return;
    }
    if (!isEdit && !form.password) {
      toast.error('Vui lòng nhập mật khẩu'); return;
    }
    // STAFF phải chọn chi nhánh
    if (form.adminRole === 'STAFF' && !form.branchId) {
      toast.error('Nhân viên (STAFF) phải được gán vào một chi nhánh!'); return;
    }

    setSaving(true);
    try {
      const url    = isEdit ? `${API}/api/staff/${staff._id}` : `${API}/api/staff`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          ...form,
          branchId: form.adminRole === 'SUPER_ADMIN' ? null : (form.branchId || null),
        }),
      }).then(r => r.json());

      if (res.success) {
        toast.success(isEdit ? '✅ Đã cập nhật phân quyền' : '✅ Đã tạo tài khoản mới');
        onSaved(res.data);
        onClose();
      } else {
        toast.error(res.message || 'Lỗi lưu dữ liệu');
      }
    } catch {
      toast.error('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  const isStaff = form.adminRole === 'STAFF';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <h3 className="font-black text-lg">{isEdit ? 'Chỉnh sửa quyền' : 'Tạo tài khoản nội bộ'}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Thông tin cơ bản */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Họ tên *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-gray-700 transition gap-2">
                <User size={14} className="text-gray-400" />
                <input type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="flex-1 text-sm outline-none" placeholder="Nguyễn Văn A" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Số điện thoại *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-gray-700 transition gap-2">
                <Phone size={14} className="text-gray-400" />
                <input type="text" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="flex-1 text-sm font-mono outline-none" placeholder="09xxxxxxxx"
                  readOnly={isEdit} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
              {isEdit ? 'Mật khẩu mới (để trống = giữ nguyên)' : 'Mật khẩu *'}
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-gray-700 transition gap-2">
              <Key size={14} className="text-gray-400" />
              <input type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="flex-1 text-sm outline-none" placeholder={isEdit ? "••••••" : "Tối thiểu 6 ký tự"} />
            </div>
          </div>

          {/* Vai trò */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Vai trò</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { val: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Toàn quyền hệ thống', icon: Crown,   color: 'amber' },
                { val: 'STAFF',       label: 'Nhân viên',   desc: 'Quyền theo cấu hình + chi nhánh', icon: UserCog, color: 'blue'  },
              ].map(({ val, label, desc, icon: Icon, color }) => (
                <button key={val}
                  onClick={() => setForm(f => ({ ...f, adminRole: val, permissions: val === 'SUPER_ADMIN' ? [] : f.permissions, branchId: val === 'SUPER_ADMIN' ? '' : f.branchId }))}
                  className={`p-3 rounded-xl border-2 text-left transition ${
                    form.adminRole === val
                      ? color === 'amber' ? 'border-amber-400 bg-amber-50' : 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <Icon size={16} className={form.adminRole === val ? (color === 'amber' ? 'text-amber-600' : 'text-blue-600') : 'text-gray-400'} />
                  <p className="font-bold text-sm mt-1">{label}</p>
                  <p className="text-[11px] text-gray-400">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── Chi nhánh — chỉ hiện và bắt buộc khi STAFF ── */}
          {isStaff && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1">
                <Building2 size={12} />
                Chi nhánh quản lý <span className="text-red-500">*</span>
              </label>
              {branchLoading ? (
                <div className="flex items-center gap-2 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-gray-400 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Đang tải chi nhánh...
                </div>
              ) : branches.length === 0 ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={14} /> Chưa có chi nhánh nào. Vui lòng tạo chi nhánh trong Cài đặt trước.
                </div>
              ) : (
                <>
                  <select
                    value={form.branchId}
                    onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                    className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none transition ${
                      !form.branchId ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-emerald-300 bg-emerald-50 focus:border-emerald-500 text-emerald-800'
                    }`}
                  >
                    <option value="">-- Chọn chi nhánh (bắt buộc) --</option>
                    {branches.filter(b => b.isActive !== false).map(b => (
                      <option key={b._id} value={b._id}>
                        🏢 {b.name} {b.code ? `[${b.code}]` : ''}
                      </option>
                    ))}
                  </select>
                  {!form.branchId && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} /> Bắt buộc chọn chi nhánh cho nhân viên
                    </p>
                  )}
                  {form.branchId && (() => {
                    const b = branches.find(x => x._id === form.branchId);
                    return b ? (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Gán vào: <strong>{b.name}</strong> (mã QR prefix: {b.code})
                      </p>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          )}

          {/* SUPER_ADMIN note */}
          {!isStaff && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
              <Crown size={13} className="text-amber-600 flex-shrink-0" />
              Super Admin quản lý <strong>toàn bộ hệ thống</strong>, không bị giới hạn theo chi nhánh.
            </div>
          )}

          {/* Permissions — chỉ hiện nếu STAFF */}
          {isStaff && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-2">
                Phân quyền module ({form.permissions.length}/{ALL_PERMISSIONS.length} quyền)
              </label>
              <div className="space-y-2">
                {ALL_PERMISSIONS.map(({ key, label, desc }) => {
                  const checked = form.permissions.includes(key);
                  return (
                    <button key={key}
                      onClick={() => togglePerm(key)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition ${
                        checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      {checked
                        ? <CheckSquare size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
                        : <Square     size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className={`text-sm font-bold ${checked ? 'text-blue-800' : 'text-gray-700'}`}>{label}</p>
                        <p className="text-[11px] text-gray-400">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {form.permissions.length === 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                  <AlertTriangle size={12} /> Nhân viên chưa có quyền nào — sẽ không thấy menu nào sau khi đăng nhập
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-50 transition">
              Hủy
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 bg-gradient-to-r from-gray-800 to-gray-900 text-white font-bold py-3 rounded-xl hover:from-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật quyền' : 'Tạo tài khoản')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function StaffManagementTab() {
  const toast = useToast();
  const { showModal } = useModal();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(undefined); // undefined=hidden, null=add, obj=edit
  const [deleting, setDeleting]   = useState(null);

  const fetchStaff = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/staff`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setStaffList(res.data); })
      .catch(() => toast.error('Không tải được danh sách nhân viên'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleDelete = async (s) => {
    showModal({
      title: 'Xoá tài khoản nội bộ?',
      content: `Bạnh có chắc chắn muốn xoá tài khoản nhân viên "${s.name}"? Người dùng này sẽ không còn quyền truy cập vào hệ thống.`,
      type: 'error',
      confirmText: 'Xoá vĩnh viễn',
      cancelText: 'Huỷ bỏ',
      onConfirm: async () => {
        setDeleting(s._id);
        try {
          const res = await fetch(`${API}/api/staff/${s._id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` },
          }).then(r => r.json());
          if (res.success) {
            setStaffList(prev => prev.filter(x => x._id !== s._id));
            toast.success(`🗑️ Đã xóa "${s.name}"`);
          } else {
            toast.error(res.message);
          }
        } catch { toast.error('Lỗi kết nối'); }
        finally { setDeleting(null); }
      }
    });
  };

  const handleSaved = (updated) => {
    setStaffList(prev => {
      const idx = prev.findIndex(x => x._id === updated._id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [updated, ...prev];
    });
  };

  return (
    <div className="space-y-5">
      {modal !== undefined && (
        <StaffModal staff={modal} onClose={() => setModal(undefined)} onSaved={handleSaved} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <ShieldCheck size={16} className="text-gray-700" /> Tài khoản & Phân quyền Nội bộ
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Chỉ Super Admin mới quản lý được trang này</p>
        </div>
        <button onClick={() => setModal(null)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-xl font-bold text-sm hover:bg-gray-700 transition">
          <UserPlus size={15} /> Tạo tài khoản
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
        <Shield size={13} className="flex-shrink-0 mt-0.5 text-blue-600" />
        <span>
          <strong>RBAC:</strong> Super Admin thấy toàn bộ menu. Nhân viên (Staff) chỉ thấy menu tương ứng với quyền đã được cấp.
          Backend cũng chặn API 403 nếu Staff truy cập route không có quyền.
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 size={22} className="animate-spin" /> <span className="text-sm">Đang tải...</span>
        </div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Chưa có tài khoản nội bộ nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffList.map(s => (
            <div key={s._id} className="bg-white border-2 border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 ${
                  s.adminRole === 'SUPER_ADMIN' ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                }`}>
                  {s.name?.charAt(0) || '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{s.name}</p>
                    <RoleBadge adminRole={s.adminRole} />
                    {s.status === 'active'
                      ? <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">● Hoạt động</span>
                      : <span className="text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">● Tắt</span>
                    }
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{s.phone}</p>
                  {/* Branch info for STAFF */}
                  {s.adminRole === 'STAFF' && s.branchId && (
                    <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                      <Building2 size={10} />
                      <span className="font-medium">{s.branchCode || 'Chi nhánh'}</span>
                      {s.branchCode && <span className="text-gray-400">— mã QR prefix</span>}
                    </p>
                  )}
                  {s.adminRole === 'STAFF' && !s.branchId && (
                    <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={10} /> Chưa gán chi nhánh
                    </p>
                  )}
                  {/* Permissions list */}
                  {s.adminRole === 'SUPER_ADMIN' ? (
                    <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1">
                      <Crown size={11} /> Toàn quyền hệ thống
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(s.permissions || []).length === 0 ? (
                        <span className="text-xs text-gray-400 italic">Chưa có quyền nào</span>
                      ) : (
                        s.permissions.map(pk => {
                          const perm = ALL_PERMISSIONS.find(p => p.key === pk);
                          return (
                            <span key={pk} className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                              {perm?.label || pk}
                            </span>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setModal(s)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                    title="Chỉnh sửa quyền">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => handleDelete(s)} disabled={deleting === s._id}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition disabled:opacity-50"
                    title="Xóa tài khoản">
                    {deleting === s._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
