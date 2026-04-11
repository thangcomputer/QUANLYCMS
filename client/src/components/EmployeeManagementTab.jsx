/**
 * EmployeeManagementTab.jsx — Module Quản lý Nhân sự & Trả lương
 * Tab 1: Danh sách nhân sự (CRUD)
 * Tab 2: Trả lương (thanh toán + VietQR + lịch sử)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Edit3, Trash2, DollarSign, Search, RefreshCw,
  CheckCircle2, XCircle, Calendar, Building2, ClipboardList,
  ChevronDown, Briefcase, Loader2, AlertCircle, X, CreditCard, QrCode
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  for (const role of ['admin','staff','teacher','student']) {
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

const POSITIONS = [
  { value: 'BAO_VE',     label: 'Bảo vệ',     emoji: '🛡️' },
  { value: 'QUAN_LY',    label: 'Quản lý',     emoji: '👔' },
  { value: 'GIANG_VIEN', label: 'Giảng viên',   emoji: '👨‍🏫' },
  { value: 'THU_VIEC',   label: 'Thử việc',     emoji: '🆕' },
  { value: 'IT',          label: 'IT',           emoji: '💻' },
  { value: 'KE_TOAN',    label: 'Kế toán',     emoji: '📊' },
  { value: 'THU_NGAN',   label: 'Thu ngân',     emoji: '💵' },
  { value: 'TRO_GIANG',  label: 'Trợ giảng',   emoji: '📚' },
  { value: 'KHAC',        label: 'Khác',         emoji: '📋' },
];

// ── Danh sách Ngân hàng Việt Nam (VietQR bin code) ──────────────────────────
const VN_BANKS = [
  { code: '970436', shortName: 'Vietcombank',      name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { code: '970418', shortName: 'BIDV',             name: 'Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam' },
  { code: '970415', shortName: 'VietinBank',       name: 'Ngân hàng TMCP Công Thương Việt Nam' },
  { code: '970405', shortName: 'Agribank',         name: 'Ngân hàng NN & PTNT Việt Nam' },
  { code: '970416', shortName: 'ACB',              name: 'Ngân hàng TMCP Á Châu' },
  { code: '970407', shortName: 'Techcombank',       name: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { code: '970423', shortName: 'TPBank',           name: 'Ngân hàng TMCP Tiên Phong' },
  { code: '970422', shortName: 'MBBank',           name: 'Ngân hàng TMCP Quân Đội' },
  { code: '970432', shortName: 'VPBank',           name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { code: '970448', shortName: 'OCB',              name: 'Ngân hàng TMCP Phương Đông' },
  { code: '970431', shortName: 'Eximbank',         name: 'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam' },
  { code: '970443', shortName: 'SHB',              name: 'Ngân hàng TMCP Sài Gòn – Hà Nội' },
  { code: '970403', shortName: 'Sacombank',        name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { code: '970437', shortName: 'HDBank',           name: 'Ngân hàng TMCP Phát Triển TPHCM' },
  { code: '970441', shortName: 'VIB',              name: 'Ngân hàng TMCP Quốc Tế Việt Nam' },
  { code: '970454', shortName: 'VietABank',        name: 'Ngân hàng TMCP Việt Á' },
  { code: '970449', shortName: 'LienVietPostBank', name: 'Ngân hàng TMCP Bưu Điện Liên Việt' },
  { code: '970426', shortName: 'MSB',              name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { code: '970414', shortName: 'OceanBank',        name: 'Ngân hàng TNHH MTV Đại Dương' },
  { code: '970429', shortName: 'SCB',              name: 'Ngân hàng TMCP Sài Gòn' },
  { code: '970433', shortName: 'VietBank',         name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { code: '970440', shortName: 'SeABank',          name: 'Ngân hàng TMCP Đông Nam Á' },
  { code: '970427', shortName: 'VietABank',        name: 'Ngân hàng TMCP Việt Á' },
  { code: '970424', shortName: 'ShinhanBank',      name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { code: '970452', shortName: 'KienLongBank',     name: 'Ngân hàng TMCP Kiên Long' },
  { code: '970430', shortName: 'PGBank',           name: 'Ngân hàng TMCP Xăng Dầu Petrolimex' },
  { code: '970400', shortName: 'SaigonBank',       name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { code: '970412', shortName: 'DongABank',        name: 'Ngân hàng TMCP Đông Á' },
  { code: '970458', shortName: 'UnitedOverseas',   name: 'Ngân hàng United Overseas Bank Việt Nam' },
  { code: '970425', shortName: 'ABBank',           name: 'Ngân hàng TMCP An Bình' },
  { code: '970446', shortName: 'COOPBANK',         name: 'Ngân hàng Hợp tác xã Việt Nam' },
  { code: '970457', shortName: 'Woori',            name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
  { code: '970462', shortName: 'KookminHN',        name: 'Ngân hàng Kookmin - CN Hà Nội' },
  { code: '970409', shortName: 'BacABank',         name: 'Ngân hàng TMCP Bắc Á' },
  { code: '970434', shortName: 'IndovinaBank',     name: 'Ngân hàng TNHH Indovina' },
  { code: '422589', shortName: 'CIMB',             name: 'Ngân hàng TNHH MTV CIMB Việt Nam' },
  { code: '546034', shortName: 'KBank',            name: 'Ngân hàng Đại Chúng TNHH Kasikornbank' },
  { code: '970410', shortName: 'StandardChartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam' },
  { code: '970429', shortName: 'PublicBank',       name: 'Ngân hàng TNHH MTV Public Bank Berhad' },
];

const BANK_MAP = Object.fromEntries(VN_BANKS.map(b => [b.code, b]));
const POSITION_MAP = Object.fromEntries(POSITIONS.map(p => [p.value, p]));

const fmt = (n) => n ? Number(n).toLocaleString('vi-VN') + 'đ' : '0đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';

// ── Session info ─────────────────────────────────────────────────────────────
function getSession() {
  for (const k of ['admin_user','staff_user']) {
    try { const s = JSON.parse(localStorage.getItem(k) || '{}'); if (s?.id) return s; } catch {}
  }
  return {};
}

export default function EmployeeManagementTab() {
  const [activeTab, setActiveTab] = useState('list');  // 'list' | 'payroll'
  const [employees, setEmployees] = useState([]);
  const [payrollLogs, setPayrollLogs] = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [error, setError]         = useState('');

  // Modal states
  const [showForm, setShowForm]     = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [showPayModal, setShowPayModal] = useState(null);  // employee obj
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Form fields
  const emptyForm = { name:'', phone:'', position:'KHAC', baseSalary:'', startDate:'', note:'', branchId:'', branchCode:'', bankCode:'', bankAccountNumber:'', bankAccountName:'' };
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ amount:'', payDate:'', note:'', monthLabel:'' });
  const [saving, setSaving] = useState(false);

  const sess = getSession();
  const isSuperAdmin = sess?.id === 'admin' || sess?.adminRole === 'SUPER_ADMIN';
  const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  
  const { selectedBranchId } = useBranch();

  // ── Branches (for super admin) ──
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (isSuperAdmin) {
      fetch(`${API}/api/branches`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.json())
        .then(res => { if (res.success) setBranches(res.data || []); })
        .catch(() => {});
    }
  }, []);

  // ── Fetch all data ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branch_id=${selectedBranchId}` : '';
      const [empRes, statsRes, payRes] = await Promise.all([
        fetch(`${API}/api/employees?position=${posFilter}&search=${search}${bQuery}`, { headers }).then(r => r.json()),
        fetch(`${API}/api/employees/stats?${bQuery.slice(1)}`, { headers }).then(r => r.json()),
        fetch(`${API}/api/employees/payroll?${bQuery.slice(1)}`, { headers }).then(r => r.json()),
      ]);
      if (empRes.success)   setEmployees(empRes.data);
      if (statsRes.success) setStats(statsRes.data);
      if (payRes.success)   setPayrollLogs(payRes.data);
    } catch { setError('Lỗi kết nối server'); }
    finally { setLoading(false); }
  }, [posFilter, search, selectedBranchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── CRUD Handlers ──
  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingEmp ? `${API}/api/employees/${editingEmp._id}` : `${API}/api/employees`;
      const method = editingEmp ? 'PUT' : 'POST';
      const body = {
        ...form,
        baseSalary: Number(form.baseSalary) || 0,
        bankAccount: {
          bankCode: form.bankCode || '',
          accountNumber: form.bankAccountNumber || '',
          accountName: form.bankAccountName || '',
        },
      };
      // Remove flat bank fields (they're nested now)
      delete body.bankCode;
      delete body.bankAccountNumber;
      delete body.bankAccountName;

      if (!isSuperAdmin) { body.branchId = sess.branchId; body.branchCode = sess.branchCode; }

      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditingEmp(null);
        setForm(emptyForm);
        fetchAll();
      } else { setError(data.message); }
    } catch { setError('Lỗi lưu dữ liệu'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`${API}/api/employees/${deleteConfirm._id}`, { method:'DELETE', headers });
      const data = await res.json();
      if (data.success) { setDeleteConfirm(null); fetchAll(); }
      else setError(data.message);
    } catch { setError('Lỗi xóa'); }
  };

  const handlePay = async () => {
    if (!showPayModal || !payForm.amount) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/employees/${showPayModal._id}/pay`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...payForm, amount: Number(payForm.amount) }),
      });
      const data = await res.json();
      if (data.success) {
        setShowPayModal(null);
        setPayForm({ amount:'', payDate:'', note:'', monthLabel:'' });
        fetchAll();
      } else setError(data.message);
    } catch { setError('Lỗi thanh toán'); }
    finally { setSaving(false); }
  };

  const openEdit = (emp) => {
    setEditingEmp(emp);
    setForm({
      name: emp.name, phone: emp.phone || '', position: emp.position,
      baseSalary: String(emp.baseSalary || ''), startDate: emp.startDate ? new Date(emp.startDate).toISOString().split('T')[0] : '',
      note: emp.note || '', branchId: emp.branchId || '', branchCode: emp.branchCode || '',
      bankCode: emp.bankAccount?.bankCode || '',
      bankAccountNumber: emp.bankAccount?.accountNumber || '',
      bankAccountName: emp.bankAccount?.accountName || '',
    });
    setShowForm(true);
  };

  const openAdd = () => {
    setEditingEmp(null);
    setForm({ ...emptyForm, startDate: new Date().toISOString().split('T')[0], branchId: sess?.branchId || '', branchCode: sess?.branchCode || '' });
    setShowForm(true);
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (emp.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── VietQR URL builder ──
  const getVietQRUrl = useMemo(() => {
    if (!showPayModal) return '';
    const bank = showPayModal.bankAccount;
    if (!bank?.bankCode || !bank?.accountNumber) return '';
    const amount = Number(payForm.amount) || 0;
    const info = encodeURIComponent(payForm.note || payForm.monthLabel || `Luong ${showPayModal.name}`);
    const accName = encodeURIComponent(bank.accountName || showPayModal.name);
    return `https://img.vietqr.io/image/${bank.bankCode}-${bank.accountNumber}-compact2.png?amount=${amount}&addInfo=${info}&accountName=${accName}`;
  }, [showPayModal, payForm.amount, payForm.note, payForm.monthLabel]);

  const hasBankInfo = showPayModal?.bankAccount?.bankCode && showPayModal?.bankAccount?.accountNumber;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <Briefcase size={22} className="text-violet-600" />
            Quản lý Nhân sự & Lương
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isSuperAdmin ? 'Toàn bộ chi nhánh' : `Chi nhánh ${sess?.branchCode || ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center"><Users size={18} className="text-violet-600" /></div>
            </div>
            <p className="text-2xl font-black text-gray-800">{stats.total}</p>
            <p className="text-xs text-gray-400 mt-1">Nhân viên đang làm</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><DollarSign size={18} className="text-emerald-600" /></div>
            </div>
            <p className="text-2xl font-black text-gray-800">{fmt(stats.totalSalary)}</p>
            <p className="text-xs text-gray-400 mt-1">Tổng quỹ lương/tháng</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><CheckCircle2 size={18} className="text-amber-600" /></div>
            </div>
            <p className="text-2xl font-black text-gray-800">{fmt(stats.paidThisMonth)}</p>
            <p className="text-xs text-gray-400 mt-1">Đã trả tháng này</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><AlertCircle size={18} className="text-red-500" /></div>
            </div>
            <p className="text-2xl font-black text-gray-800">{fmt(Math.max(0, (stats.totalSalary || 0) - (stats.paidThisMonth || 0)))}</p>
            <p className="text-xs text-gray-400 mt-1">Còn nợ tháng này</p>
          </div>
        </div>
      )}

      {/* ── Tab switcher ── */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'list', label: '📋 Danh sách nhân sự', icon: ClipboardList },
          { id: 'payroll', label: '💰 Trả lương', icon: DollarSign },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`pb-2 px-4 text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ═══════════════ TAB 1: DANH SÁCH NHÂN SỰ ═══════════════ */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Tìm nhân viên..." value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-300 w-52" />
              </div>
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
                <option value="all">Tất cả chức vụ</option>
                {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-500 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all active:scale-95">
              <Plus size={16} /> THÊM NHÂN SỰ
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-gray-500 uppercase">Chức vụ</th>
                  {isSuperAdmin && <th className="px-4 py-3 text-left text-xs font-black text-gray-500 uppercase">Chi nhánh</th>}
                  <th className="px-4 py-3 text-right text-xs font-black text-gray-500 uppercase">Mức lương</th>
                  <th className="px-4 py-3 text-center text-xs font-black text-gray-500 uppercase">Ngân hàng</th>
                  <th className="px-4 py-3 text-center text-xs font-black text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && !filteredEmployees.length ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto mb-2" />Đang tải...</td></tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                    <Briefcase size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Chưa có nhân viên nào</p>
                  </td></tr>
                ) : filteredEmployees.map(emp => (
                  <tr key={emp._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-black flex-shrink-0">
                          {emp.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">{emp.name}</p>
                          {emp.phone && <p className="text-xs text-gray-400">{emp.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                        {POSITION_MAP[emp.position]?.emoji || '📋'} {POSITION_MAP[emp.position]?.label || emp.position}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-4">
                        <span className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-semibold border border-teal-200">
                          🏢 {emp.branchCode || '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-4 text-right font-black text-gray-800">{fmt(emp.baseSalary)}</td>
                    <td className="px-4 py-4 text-center">
                      {emp.bankAccount?.bankCode ? (
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-100">
                          🏦 {BANK_MAP[emp.bankAccount.bankCode]?.shortName || emp.bankAccount.bankCode}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">Chưa có</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(emp)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition" title="Sửa">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => setDeleteConfirm(emp)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Xóa">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Position breakdown */}
          {stats?.byPosition?.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-2">PHÂN BỔ CHỨC VỤ</p>
              <div className="flex flex-wrap gap-2">
                {stats.byPosition.map(bp => (
                  <span key={bp._id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-gray-200 text-gray-600">
                    {POSITION_MAP[bp._id]?.emoji || '📋'} {POSITION_MAP[bp._id]?.label || bp._id}: {bp.count} ({fmt(bp.salary)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB 2: TRẢ LƯƠNG ═══════════════ */}
      {activeTab === 'payroll' && (
        <div className="space-y-4">
          {/* Active employees — pay buttons */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-700 flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-500" /> Thanh toán lương nhân viên
              </h3>
            </div>
            <div className="divide-y divide-gray-50">
              {employees.filter(e => e.status === 'active').length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Chưa có nhân viên</div>
              ) : employees.filter(e => e.status === 'active').map(emp => (
                <div key={emp._id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-black flex-shrink-0">
                      {POSITION_MAP[emp.position]?.emoji || '📋'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{emp.name}</p>
                      <p className="text-xs text-gray-400">
                        {POSITION_MAP[emp.position]?.label || emp.position}
                        {emp.branchCode && ` · ${emp.branchCode}`}
                        {emp.baseSalary > 0 && ` · Lương: ${fmt(emp.baseSalary)}`}
                        {emp.bankAccount?.bankCode && ` · 🏦 ${BANK_MAP[emp.bankAccount.bankCode]?.shortName || ''}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowPayModal(emp); setPayForm({ amount: String(emp.baseSalary || ''), payDate: new Date().toISOString().split('T')[0], note:'', monthLabel: `Tháng ${new Date().getMonth()+1}/${new Date().getFullYear()}` }); }}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all active:scale-95"
                  >
                    <DollarSign size={14} /> Thanh toán
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Payroll history */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-700 flex items-center gap-2">
                <Calendar size={16} className="text-blue-500" /> Lịch sử trả lương
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Nhân viên</th>
                    <th className="px-4 py-3 text-left text-xs font-black text-gray-500 uppercase">Chức vụ</th>
                    <th className="px-4 py-3 text-right text-xs font-black text-gray-500 uppercase">Số tiền</th>
                    <th className="px-4 py-3 text-center text-xs font-black text-gray-500 uppercase">Loại</th>
                    <th className="px-4 py-3 text-center text-xs font-black text-gray-500 uppercase">Ngày trả</th>
                    <th className="px-4 py-3 text-left text-xs font-black text-gray-500 uppercase">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payrollLogs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Chưa có lịch sử trả lương</td></tr>
                  ) : payrollLogs.map(log => (
                    <tr key={log._id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3 font-medium text-gray-800">{log.employeeName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                          {POSITION_MAP[log.position]?.emoji || ''} {POSITION_MAP[log.position]?.label || log.position}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">{fmt(log.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${log.salaryType === 'LUONG_CUNG' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {log.salaryType === 'LUONG_CUNG' ? '💼 Lương cứng' : '🏫 Ca dạy'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{fmtDate(log.payDate)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{log.monthLabel}{log.note ? ` — ${log.note}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: THÊM/SỬA NHÂN SỰ ═══════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-violet-600 to-purple-500 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Briefcase size={18} /> {editingEmp ? 'Chỉnh sửa Nhân viên' : 'Thêm Nhân viên mới'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white/70 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* ── Thông tin cơ bản ── */}
              <div>
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users size={13} /> Thông tin cơ bản
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-500 block mb-1">Họ tên *</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none" placeholder="Nguyễn Văn A" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Số điện thoại</label>
                    <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none" placeholder="0912345678" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Chức vụ</label>
                    <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none bg-white">
                      {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.emoji} {p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Mức lương (VNĐ/tháng)</label>
                    <input type="number" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none" placeholder="5000000" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Ngày vào làm</label>
                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none" />
                  </div>
                  {isSuperAdmin && (
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-gray-500 block mb-1">Chi nhánh</label>
                      <select value={form.branchId} onChange={e => {
                        const br = branches.find(b => String(b._id) === e.target.value);
                        setForm(f => ({ ...f, branchId: e.target.value, branchCode: br?.code || br?.name || '' }));
                      }}
                        className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none bg-white">
                        <option value="">— Chọn chi nhánh —</option>
                        {branches.map(b => <option key={b._id} value={b._id}>🏢 {b.name} ({b.code})</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Thông tin thanh toán ── */}
              <div>
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CreditCard size={13} /> Thông tin thanh toán (VietQR)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-500 block mb-1">Ngân hàng</label>
                    <select value={form.bankCode} onChange={e => setForm(f => ({ ...f, bankCode: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none bg-white">
                      <option value="">— Chọn ngân hàng —</option>
                      {VN_BANKS.map(b => <option key={b.code} value={b.code}>🏦 {b.shortName} — {b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Số tài khoản</label>
                    <input type="text" value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none" placeholder="0123456789" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Tên chủ tài khoản</label>
                    <input type="text" value={form.bankAccountName} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value.toUpperCase() }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none uppercase" placeholder="NGUYEN VAN A" />
                  </div>
                </div>
              </div>

              {/* ── Ghi chú ── */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Ghi chú</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-violet-400 outline-none resize-none h-16" placeholder="Ghi chú tùy ý..." />
              </div>

              {form.position === 'GIANG_VIEN' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  💡 Chức vụ <strong>Giảng viên</strong>: Đây là lương cứng hàng tháng. Tiền ca dạy sẽ được tính riêng ở module Giảng viên.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-violet-700 transition disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingEmp ? 'Cập nhật' : 'Thêm nhân viên'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: THANH TOÁN LƯƠNG + VIETQR ═══════════════ */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => setShowPayModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                <DollarSign size={18} /> Thanh toán lương — {showPayModal.name}
              </h3>
              <button onClick={() => setShowPayModal(null)} className="text-white/70 hover:text-white"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* ── CỘT TRÁI: MÃ QR ── */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 flex flex-col items-center justify-center border-r border-gray-100">
                {hasBankInfo ? (
                  <>
                    <div className="bg-white rounded-2xl shadow-lg p-3 mb-4">
                      <img
                        key={getVietQRUrl}
                        src={getVietQRUrl}
                        alt="VietQR Code"
                        className="w-56 h-56 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                      <div className="w-56 h-56 items-center justify-center text-gray-400 text-sm text-center" style={{ display: 'none' }}>
                        <QrCode size={40} className="mx-auto mb-2 opacity-30" />
                        <p>Không tải được QR</p>
                      </div>
                    </div>
                    <div className="text-center space-y-1.5 w-full max-w-[240px]">
                      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Ngân hàng</p>
                        <p className="text-sm font-black text-gray-800">
                          {BANK_MAP[showPayModal.bankAccount.bankCode]?.shortName || showPayModal.bankAccount.bankCode}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Số tài khoản</p>
                        <p className="text-sm font-black text-gray-800 tracking-wider">{showPayModal.bankAccount.accountNumber}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-0.5">Người nhận</p>
                        <p className="text-sm font-black text-gray-800 uppercase">{showPayModal.bankAccount.accountName || showPayModal.name}</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-3 text-center">QR tự động cập nhật khi thay đổi số tiền / ghi chú</p>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <AlertCircle size={28} className="text-amber-500" />
                    </div>
                    <p className="text-sm font-bold text-amber-700 mb-1">Chưa có thông tin ngân hàng</p>
                    <p className="text-xs text-gray-400 max-w-[220px] mx-auto">
                      Nhân viên này chưa cập nhật thông tin ngân hàng. Vui lòng cập nhật hồ sơ để sử dụng mã QR.
                    </p>
                    <button onClick={() => { setShowPayModal(null); openEdit(showPayModal); }}
                      className="mt-3 text-xs text-violet-600 font-bold hover:underline">
                      → Cập nhật hồ sơ ngay
                    </button>
                  </div>
                )}
              </div>

              {/* ── CỘT PHẢI: FORM THANH TOÁN ── */}
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-black text-emerald-700">
                    {showPayModal.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{showPayModal.name}</p>
                    <p className="text-xs text-gray-400">{POSITION_MAP[showPayModal.position]?.label || showPayModal.position} · Lương: {fmt(showPayModal.baseSalary)}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Số tiền trả (VNĐ) *</label>
                  <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-400 outline-none" />
                  {payForm.amount && (
                    <p className="text-xs text-emerald-600 font-bold mt-1">
                      = {fmt(payForm.amount)}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Ngày trả</label>
                    <input type="date" value={payForm.payDate} onChange={e => setPayForm(f => ({ ...f, payDate: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-400 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Tháng lương</label>
                    <input type="text" value={payForm.monthLabel} onChange={e => setPayForm(f => ({ ...f, monthLabel: e.target.value }))}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-400 outline-none" placeholder="Tháng 4/2026" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Ghi chú</label>
                  <textarea value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-400 outline-none resize-none h-16" placeholder="VD: Đã trừ 1 ngày nghỉ..." />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowPayModal(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
                  <button onClick={handlePay} disabled={saving || !payForm.amount}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Xác nhận thanh toán
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: XÁC NHẬN XÓA ═══════════════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4">
              <h3 className="text-white font-bold flex items-center gap-2"><Trash2 size={18} /> Xác nhận xóa</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Bạn có chắc muốn xóa nhân viên <strong>{deleteConfirm.name}</strong>?</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">Hủy</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition">Xóa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
