/**
 * CoursePricingTab.jsx
 * Quản lý Đơn giá Khóa học — CRUD Table + Modal
 * Tích hợp trong SystemSettingsTab
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Save, X, Loader2, AlertCircle,
  DollarSign, Percent, Tag, BookOpen, CheckCircle2
} from 'lucide-react';
import { useToast } from '../utils/toast';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Helper ────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const calcEffective = (price, pct) =>
  pct > 0 ? Math.round(Number(price) * (1 - Number(pct) / 100)) : Number(price);

function getToken() {
  for (const role of ['admin','staff']) {
    const directToken = localStorage.getItem(`${role}_access_token`);
    if (directToken) return directToken;
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

// ── Modal Thêm/Sửa ────────────────────────────────────────────────────────────
function CourseModal({ course, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!course?._id;

  const [form, setForm] = useState({
    name:            course?.name || '',
    price:           course?.price || '',
    discountPercent: course?.discountPercent || 0,
    totalSessions:   course?.totalSessions || 12,
    description:     course?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const effective = calcEffective(form.price, form.discountPercent);
  const hasDiscount = Number(form.discountPercent) > 0 && Number(form.price) > 0;

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Vui lòng nhập tên khóa học'); return; }
    if (!form.price || Number(form.price) <= 0) { toast.error('Giá gốc không hợp lệ'); return; }

    setSaving(true);
    try {
      const url    = isEdit ? `${API}/api/courses/${course._id}` : `${API}/api/courses`;
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        name:            form.name.trim(),
        price:           Number(form.price),
        discountPercent: Number(form.discountPercent),
        discountPrice:   effective,
        totalSessions:   Number(form.totalSessions),
        description:     form.description,
        status:          'published',
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      }).then(r => r.json());

      if (res.success) {
        toast.success(isEdit ? `✅ Đã cập nhật "${form.name}"` : `✅ Đã thêm "${form.name}"`);
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen size={18} />
            </div>
            <h3 className="font-black text-lg">{isEdit ? 'Sửa khóa học' : 'Thêm khóa học mới'}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tên khóa học */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Tên khóa học *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none transition"
              placeholder="VD: THVP Nâng Cao (12 Buổi)"
            />
          </div>

          {/* Số buổi */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Số buổi học</label>
            <input
              type="number"
              value={form.totalSessions}
              onChange={e => setForm(f => ({ ...f, totalSessions: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none transition"
              min="1"
            />
          </div>

          {/* Giá gốc + % giảm side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Giá gốc (VNĐ) *</label>
              <div className="flex items-center border-2 border-gray-200 rounded-xl px-3 py-3 focus-within:border-blue-400 transition gap-1">
                <DollarSign size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="flex-1 text-sm font-mono outline-none bg-transparent min-w-0"
                  placeholder="2699000"
                  min="0"
                  step="10000"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Giảm giá (%)</label>
              <div className="flex items-center border-2 border-gray-200 rounded-xl px-3 py-3 focus-within:border-red-400 transition gap-1">
                <Percent size={14} className="text-red-400 flex-shrink-0" />
                <input
                  type="number"
                  value={form.discountPercent}
                  onChange={e => setForm(f => ({ ...f, discountPercent: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                  className="flex-1 text-sm font-mono outline-none bg-transparent min-w-0"
                  placeholder="0"
                  min="0"
                  max="100"
                />
              </div>
            </div>
          </div>

          {/* Live preview giá hiệu quả */}
          <div className={`rounded-2xl p-4 border-2 transition ${hasDiscount ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Giá thu thực tế (preview)</p>
            {hasDiscount ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="line-through text-gray-400 text-sm">{fmt(form.price)}đ</span>
                <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                  -{form.discountPercent}%
                </span>
                <span className="text-2xl font-black text-red-600">{fmt(effective)}đ</span>
              </div>
            ) : (
              <span className="text-2xl font-black text-blue-700">
                {form.price ? fmt(Number(form.price)) + 'đ' : '—'}
              </span>
            )}
            {hasDiscount && (
              <p className="text-xs text-red-500 mt-1">
                Tiết kiệm: {fmt(Number(form.price) - effective)}đ
              </p>
            )}
          </div>

          {/* Mô tả */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Mô tả ngắn (tùy chọn)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none resize-none transition"
              placeholder="Mô tả ngắn về khóa học..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-50 transition">
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl hover:from-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Thêm khóa học')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CoursePricingTab() {
  const toast = useToast();
  const [courses, setCourses]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalCourse, setModalCourse] = useState(undefined); // undefined=closed, null=add, obj=edit
  const [deleting, setDeleting]     = useState(null);

  const fetchCourses = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/courses`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setCourses(res.data);
      })
      .catch(() => toast.error('Không tải được danh sách khóa học'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleDelete = async (course) => {
    if (!window.confirm(`Xóa khóa học "${course.name}"?\nHành động này không thể hoàn tác!`)) return;
    setDeleting(course._id);
    try {
      const res = await fetch(`${API}/api/courses/${course._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then(r => r.json());
      if (res.success) {
        setCourses(prev => prev.filter(c => c._id !== course._id));
        toast.success(`🗑️ Đã xóa "${course.name}"`);
      } else {
        toast.error(res.message || 'Lỗi xóa khóa học');
      }
    } catch {
      toast.error('Lỗi kết nối server');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = (updatedCourse) => {
    setCourses(prev => {
      const idx = prev.findIndex(c => c._id === updatedCourse._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedCourse;
        return next;
      }
      return [updatedCourse, ...prev];
    });
  };

  return (
    <div className="space-y-4">
      {/* Modal */}
      {modalCourse !== undefined && (
        <CourseModal
          course={modalCourse}
          onClose={() => setModalCourse(undefined)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Tag size={16} className="text-blue-600" /> Quản lý Học phí Khóa học
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Thay đổi giá chỉ ảnh hưởng học viên đăng ký <strong>mới</strong></p>
        </div>
        <button
          onClick={() => setModalCourse(null)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-sm shadow-blue-200"
        >
          <Plus size={15} /> Thêm khóa học
        </button>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
        <AlertCircle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <span>
          <strong>Price Snapshot:</strong> Học viên đã đăng ký trước đây sẽ giữ nguyên giá cũ.
          Để điều chỉnh giá cho học viên cụ thể → Quản lý Học viên → Cập nhật học phí.
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 size={22} className="animate-spin text-blue-400" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Chưa có khóa học nào.</p>
          <button onClick={() => setModalCourse(null)}
            className="mt-3 text-blue-600 font-bold text-sm hover:underline">
            + Thêm khóa học đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-bold text-gray-500 text-xs uppercase">Tên khóa học</th>
                <th className="text-right px-4 py-3 font-bold text-gray-500 text-xs uppercase">Giá gốc</th>
                <th className="text-center px-4 py-3 font-bold text-gray-500 text-xs uppercase">Giảm giá</th>
                <th className="text-right px-4 py-3 font-bold text-gray-500 text-xs uppercase">Giá áp dụng</th>
                <th className="text-center px-4 py-3 font-bold text-gray-500 text-xs uppercase">Buổi</th>
                <th className="text-center px-4 py-3 font-bold text-gray-500 text-xs uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course, idx) => {
                const ep = calcEffective(course.price, course.discountPercent);
                const hasDiscount = course.discountPercent > 0;
                return (
                  <tr key={course._id} className={`border-b border-gray-100 hover:bg-blue-50/30 transition ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    {/* Tên */}
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-gray-800 text-sm leading-tight">{course.name}</p>
                      {course.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{course.description}</p>
                      )}
                    </td>
                    {/* Giá gốc */}
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-mono text-sm ${hasDiscount ? 'line-through text-gray-400' : 'font-bold text-gray-800'}`}>
                        {fmt(course.price)}đ
                      </span>
                    </td>
                    {/* Giảm giá */}
                    <td className="px-4 py-3.5 text-center">
                      {hasDiscount ? (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 font-black text-xs px-2.5 py-1 rounded-full">
                          -{course.discountPercent}%
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    {/* Giá áp dụng */}
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-mono font-black text-sm ${hasDiscount ? 'text-red-600' : 'text-blue-700'}`}>
                        {fmt(ep)}đ
                      </span>
                    </td>
                    {/* Buổi */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-bold text-gray-500">{course.totalSessions}</span>
                    </td>
                    {/* Thao tác */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setModalCourse(course)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                          title="Sửa"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(course)}
                          disabled={deleting === course._id}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition disabled:opacity-50"
                          title="Xóa"
                        >
                          {deleting === course._id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={14} />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
