/**
 * RevenueAnalyticsTab.jsx — Dashboard Báo cáo Doanh thu Đa tầng
 * Hiển thị: Tổng doanh thu, So sánh kỳ trước, Biểu đồ thời gian, Breakdown theo chi nhánh
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, BarChart3, Calendar, Building2,
  RefreshCw, Download, Users, DollarSign, Target, Loader2,
  ChevronDown, AlertCircle
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';

const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");

function getToken() {
  for (const role of ['admin','staff','teacher','student']) {
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  for (const role of ['admin','staff']) {
    const t = localStorage.getItem(`${role}_access_token`);
    if (t) return t;
  }
  return '';
}

const PERIODS = [
  { value: '1d',  label: 'Hôm nay',   icon: '📅' },
  { value: '7d',  label: '7 ngày',    icon: '📆' },
  { value: '1m',  label: '1 tháng',   icon: '🗓️' },
  { value: '2m',  label: '2 tháng',   icon: '📊' },
  { value: '10m', label: '10 tháng',  icon: '📈' },
  { value: '1y',  label: '1 năm',     icon: '🏆' },
  { value: '2y',  label: '2 năm',     icon: '🚀' },
];

const BRANCH_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

// ── Sparkline bar chart (CSS-based, no library needed) ─────────────────────────
function BarChart({ data = [], color = '#6366f1', height = 80 }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 w-full" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-sm transition-all duration-300 hover:opacity-80 cursor-pointer"
              style={{ height: `${Math.max(pct, 2)}%`, background: color, minHeight: 2 }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10 shadow-lg">
              {d.label}<br />{d.value.toLocaleString('vi-VN')}đ
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mini donut chart (SVG) ─────────────────────────────────────────────────────
function DonutChart({ segments = [], size = 100 }) {
  const total = segments.reduce((s, sg) => s + (sg.pct || 0), 1);
  let angle = -90;
  const r = 38, cx = 50, cy = 50;
  const arcs = segments.map((seg, i) => {
    const pct   = (seg.pct / total) * 360;
    const start = angle;
    angle += pct;
    const x1 = cx + r * Math.cos((start * Math.PI) / 180);
    const y1 = cy + r * Math.sin((start * Math.PI) / 180);
    const x2 = cx + r * Math.cos((angle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((angle * Math.PI) / 180);
    const large = pct > 180 ? 1 : 0;
    return { ...seg, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: BRANCH_COLORS[i % BRANCH_COLORS.length] };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} opacity={0.85} />)}
      <circle cx={50} cy={50} r={24} fill="white" />
    </svg>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = '#6366f1', trend, loading }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-emerald-50 text-emerald-600' : trend < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : null}
            {trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : 'Không đổi'}
          </div>
        )}
      </div>
      {loading
        ? <div className="h-7 w-28 bg-gray-100 rounded animate-pulse mb-1" />
        : <p className="text-2xl font-black text-gray-800">{value}</p>
      }
      <p className="text-xs text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-gray-300 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RevenueAnalyticsTab() {
  const [period, setPeriod]       = useState('1m');
  const [data, setData]           = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [branchOverview, setBranchOverview] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [activeTab, setActiveTab] = useState('revenue');

  // ⭐ RBAC: Staff tự động khóa vào chi nhánh của mình
  const sess = (() => {
    for (const k of ['admin_user','staff_user']) {
      try { const s = JSON.parse(localStorage.getItem(k) || '{}'); if (s?.id) return s; } catch {}
    }
    return {};
  })();
  const isSuperAdmin = sess?.id === 'admin' || sess?.adminRole === 'SUPER_ADMIN';
  const staffBranchCode = sess?.branchCode || '';

  const { selectedBranchId } = useBranch();

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchAll = useCallback(async (p, b) => {
    setLoading(true);
    setError('');
    try {
      const qs = `period=${p}&branchId=${b || 'all'}`;
      const [rev, enr, brOv] = await Promise.all([
        fetch(`${API}/api/analytics/revenue?${qs}`, { headers }).then(r => r.json()),
        fetch(`${API}/api/analytics/enrollment?${qs}`, { headers }).then(r => r.json()),
        // Staff không cần xem tổng quan tất cả chi nhánh
        isSuperAdmin
          ? fetch(`${API}/api/analytics/branches`, { headers }).then(r => r.json())
          : Promise.resolve({ success: true, data: [] }),
      ]);
      if (rev.success)  setData(rev.data);
      if (enr.success)  setEnrollment(enr.data);
      if (brOv.success) setBranchOverview(brOv.data);
    } catch { setError('Lỗi kết nối server. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }, [isSuperAdmin]);

  useEffect(() => { 
    // Khi gọi API lấy thông số, dùng selectedBranchId từ Topbar
    fetchAll(period, selectedBranchId); 
  }, [period, selectedBranchId, fetchAll]);

  const fmt = (n) => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';
  const selectedPeriodLabel = PERIODS.find(p => p.value === period)?.label || '';

  return (
    <div className="space-y-6 p-1">
      {/* ── Header Controls ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <BarChart3 size={22} className="text-indigo-600" />
            Báo cáo Doanh thu
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{isSuperAdmin ? 'Thống kê đa chi nhánh theo thời gian thực' : `Doanh thu chi nhánh ${staffBranchCode}`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isSuperAdmin && (
            <div className="flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 rounded-xl px-3 py-2 text-sm font-bold text-indigo-700">
              <Building2 size={14} /> {staffBranchCode || 'Chi nhánh của bạn'}
            </div>
          )}
          {/* Refresh */}
          <button onClick={() => fetchAll(period, selectedBranchId)} disabled={loading}
            className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Period Selector ─────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold transition ${
              period === p.value
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
            }`}>
            <span>{p.icon}</span> {p.label}
          </button>
        ))}
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={`Doanh thu ${selectedPeriodLabel}`} value={fmt(data?.totalRevenue)}
          icon={DollarSign} color="#6366f1" trend={data?.growthPct} loading={loading}
          sub={`So với kỳ trước: ${fmt(data?.prevRevenue)}`} />
        <StatCard label="Học viên đóng tiền" value={data?.paidStudentsCount ?? '—'}
          icon={Users} color="#10b981" trend={null} loading={loading}
          sub={`Trong ${selectedPeriodLabel}`} />
        <StatCard label="Học viên mới đăng ký" value={data?.newStudentsCount ?? '—'}
          icon={Target} color="#f59e0b" trend={null} loading={loading}
          sub={`Trong ${selectedPeriodLabel}`} />
        <StatCard label="Tổng tích lũy (all-time)" value={fmt(data?.allTimeRevenue)}
          icon={TrendingUp} color="#ef4444" trend={null} loading={loading}
          sub="Toàn bộ thời gian" />
      </div>

      {/* ── Sub-tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'revenue',  label: '📈 Doanh thu theo thời gian' },
          ...(isSuperAdmin ? [{ id: 'branches', label: '🏢 Theo chi nhánh' }] : []),
          { id: 'enrollment', label: '👥 Học viên đăng ký' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`pb-2 px-3 text-sm font-bold border-b-2 transition ${
              activeTab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Revenue Timeline ──────────────────────────────────── */}
      {activeTab === 'revenue' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-500" />
            Biểu đồ doanh thu — {selectedPeriodLabel}
          </h3>
          {loading ? (
            <div className="flex items-center justify-center h-24 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : data?.timeSeries?.length ? (
            <>
              <BarChart data={data.timeSeries} color="#6366f1" height={120} />
              <div className="flex justify-between text-[10px] text-gray-400 mt-2">
                <span>{data.timeSeries[0]?.label}</span>
                <span>{data.timeSeries[data.timeSeries.length - 1]?.label}</span>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 py-8 text-sm">Chưa có dữ liệu trong khoảng này</div>
          )}
        </div>
      )}

      {/* ── Tab: By Branch ─────────────────────────────────────────── */}
      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Donut */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-700 mb-4">Tỷ lệ đóng góp</h3>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
            ) : (data?.byBranch?.length ? (
              <div className="flex items-center gap-6">
                <DonutChart segments={data.byBranch} size={110} />
                <div className="space-y-2 flex-1">
                  {data.byBranch.map((b, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                        <span className="text-xs font-medium text-gray-700">{b.branchCode || 'Không xác định'}</span>
                      </div>
                      <span className="text-xs font-black text-gray-600">{b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="text-center text-gray-400 py-4 text-sm">Chưa có dữ liệu</div>)}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-700 mb-4">Chi tiết từng chi nhánh</h3>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : (branchOverview.length ? (
              <div className="space-y-3">
                {branchOverview.map((b, i) => (
                  <div key={b._id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black"
                        style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }}>
                        {(b.code || b.name || '?')[0]}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-700">{b.name}</p>
                        <p className="text-[10px] text-gray-400">{b.studentCount} học viên · {b.paidCount} đã thu</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-indigo-700">{b.revenue.toLocaleString('vi-VN')}đ</p>
                      <p className="text-[10px] text-gray-400">{b.pct}% tổng</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-center text-gray-400 py-4 text-sm">Chưa có chi nhánh</div>)}
          </div>
        </div>
      )}

      {/* ── Tab: Enrollment ────────────────────────────────────────── */}
      {activeTab === 'enrollment' && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Học viên mới', value: enrollment?.total ?? '—', color: '#6366f1' },
              { label: 'Đã đóng học phí', value: enrollment?.paid ?? '—', color: '#10b981' },
              { label: 'Học phí thu được', value: enrollment?.totalFee ? fmt(enrollment.totalFee) : '0đ', color: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Enrollment chart */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-700 mb-4">Đăng ký theo thời gian — {selectedPeriodLabel}</h3>
            {loading
              ? <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
              : enrollment?.timeSeries?.length
                ? <BarChart data={enrollment.timeSeries.map(d => ({ ...d, value: d.value || 0 }))} color="#10b981" height={100} />
                : <div className="text-center text-gray-400 py-4 text-sm">Chưa có dữ liệu</div>
            }
          </div>

          {/* By branch table */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-black text-gray-700 mb-4">Đăng ký theo chi nhánh</h3>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : (enrollment?.byBranch?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="pb-2 text-left font-bold">Chi nhánh</th>
                      <th className="pb-2 text-center font-bold whitespace-nowrap">Học viên mới</th>
                      <th className="pb-2 text-center font-bold whitespace-nowrap">Đã thu phí</th>
                      <th className="pb-2 text-right font-bold whitespace-nowrap">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollment.byBranch.map((b, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 font-medium text-gray-700 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Building2 size={13} className="text-gray-400 flex-shrink-0" />
                            {b.branchCode || 'Không xác định'}
                          </div>
                        </td>
                        <td className="py-2.5 text-center font-bold text-indigo-700">{b.count}</td>
                        <td className="py-2.5 text-center text-emerald-600 font-bold">{b.paid}</td>
                        <td className="py-2.5 text-right font-black text-gray-800 whitespace-nowrap">{b.revenue.toLocaleString('vi-VN')}đ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="text-center text-gray-400 py-4 text-sm">Chưa có dữ liệu đăng ký</div>)}
          </div>

          {/* By course */}
          {enrollment?.byCourse?.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-black text-gray-700 mb-4">Đăng ký theo khóa học</h3>
              <div className="space-y-2">
                {enrollment.byCourse.slice(0, 6).map((c, i) => {
                  const maxCount = enrollment.byCourse[0]?.count || 1;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-gray-600 font-medium truncate">{c.course}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${(c.count/maxCount)*100}%`, background: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                      </div>
                      <div className="w-16 text-right text-xs font-black text-gray-700">{c.count} HV</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
