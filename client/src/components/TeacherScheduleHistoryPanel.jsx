import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, Loader2, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  for (const role of ['admin','staff']) {
    const directToken = localStorage.getItem(`${role}_access_token`);
    if (directToken) return directToken;
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

export default function TeacherScheduleHistoryPanel({ teacherId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API}/api/schedules/history/${teacherId}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const result = await res.json();
        if (!active) return;
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.message || 'Lỗi tải lịch sử');
        }
      } catch (err) {
        if (active) setError('Lỗi kết nối máy chủ');
      } finally {
        if (active) setLoading(false);
      }
    };
    if (teacherId) {
      fetchHistory();
    }
    return () => { active = false; };
  }, [teacherId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Loader2 size={32} className="animate-spin mb-3 text-blue-500" />
        <p className="text-sm font-medium">Đang tải lịch sử sắp lịch...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50/50 border border-red-100 text-red-600 p-6 rounded-2xl text-center flex flex-col items-center justify-center py-8">
        <AlertCircle size={32} className="mb-2 text-red-400" />
        <p className="font-bold">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { totalCreated, totalCancelled, cancelRate, history } = data;

  return (
    <div className="space-y-5">
      {/* 4-Stat Box */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50 rounded-2xl p-4 text-center shadow-sm">
          <p className="text-3xl font-black text-blue-700">{totalCreated}</p>
          <p className="text-[10px] uppercase font-black text-blue-500 mt-1.5 tracking-wider">Lịch đã xếp</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100/50 rounded-2xl p-4 text-center shadow-sm">
          <p className="text-3xl font-black text-red-600">{totalCancelled}</p>
          <p className="text-[10px] uppercase font-black text-red-500 mt-1.5 tracking-wider">Đã huỷ</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100/50 rounded-2xl p-4 text-center shadow-sm">
          <p className="text-3xl font-black text-amber-600">{cancelRate}%</p>
          <p className="text-[10px] uppercase font-black text-amber-600 mt-1.5 tracking-wider">Tỷ lệ hủy</p>
        </div>
      </div>

      {/* Danh sách */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-5 py-3 border-b-2 border-slate-100 flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2">
            <Calendar size={16} className="text-slate-500" /> Bản ghi hoạt động
          </h4>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">Chưa có hoạt động xếp lịch nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-black border-b border-slate-100 tracking-wider">
                <tr>
                  <th className="px-5 py-3 w-[150px]">Lúc</th>
                  <th className="px-5 py-3 w-[120px]">Hành động</th>
                  <th className="px-5 py-3">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map(log => (
                  <tr key={log._id} className="bg-white hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-500 font-medium">
                      {new Date(log.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-5 py-3.5">
                      {log.action === 'CREATED' ? (
                        <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-blue-100/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Đã xếp lịch
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-red-100/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Đã hủy lịch
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {log.action === 'CREATED' ? (
                        <div className="text-xs text-slate-600">
                          Lớp ngày: <span className="font-bold text-slate-800">{new Date(log.newValue?.date).toLocaleDateString('vi-VN')}</span>, 
                          Ca: <span className="font-bold text-slate-800">{log.newValue?.startTime} - {log.newValue?.endTime}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-red-600 font-medium">
                          Lý do: <span className="font-bold">{log.reason || 'Không cung cấp lý do'}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
