import React, { useState } from 'react';
import { X, Save, User, Phone, Mail, MapPin } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';

const StudentProfileUpdateModal = ({ student, onClose }) => {
  const { updateStudent } = useData();
  const { showModal } = useModal();
  const [formData, setFormData] = useState({
    name: student.name || '',
    phone: student.phone || '',
    zalo: student.zalo || '',
    email: student.email || '',
    address: student.address || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateStudent(student.id, formData);
      showModal({ title: 'Thành công', content: 'Hệ thống đã cập nhật thông tin hồ sơ của bạn thành công!', type: 'success' });
      onClose();
    } catch (err) {
      showModal({ title: 'Lỗi cập nhật', content: 'Đã xảy ra sự cố khi lưu hồ sơ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-teal-50">
          <h3 className="font-black text-teal-800 flex items-center gap-2">
            <User size={18} /> Cập nhật Hồ sơ Cá nhân
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 bg-white rounded-full p-1.5 shadow-sm transition">
            <X size={16} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1 mb-1 block">Họ và Tên</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
              readOnly
            />
            <p className="text-[9px] text-red-500 mt-1 pl-1 italic">* Tên không thể tự sửa. Vui lòng liên hệ Admin.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1 mb-1 block">Số điện thoại</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
                />
                <Phone size={14} className="absolute left-3 top-3.5 text-gray-400" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1 mb-1 block">Zalo</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.zalo}
                  onChange={e => setFormData({ ...formData, zalo: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
                />
                <Phone size={14} className="absolute left-3 top-3.5 text-blue-400" />
              </div>
            </div>
          </div>
          
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1 mb-1 block">Email</label>
            <div className="relative">
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
                placeholder="Ví dụ: nguyenvan@gmail.com"
              />
              <Mail size={14} className="absolute left-3 top-3.5 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1 mb-1 block">Địa chỉ</label>
            <div className="relative">
              <input 
                type="text" 
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
                placeholder="Nhập địa chỉ của bạn"
              />
              <MapPin size={14} className="absolute left-3 top-3.5 text-gray-400" />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-6 flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-xl shadow-lg shadow-teal-200 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : <><Save size={16} /> Lưu thông tin</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentProfileUpdateModal;
