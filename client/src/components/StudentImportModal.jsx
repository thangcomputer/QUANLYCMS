import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, FileSpreadsheet, Upload, Download, AlertCircle, 
  CheckCircle2, Loader2, Info, ChevronRight, Table
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../utils/toast.jsx';
import { mutate } from 'swr';

export default function StudentImportModal({ onClose, branchId }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'success'
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, success: 0 });
  const fileInputRef = useRef(null);
  const toast = useToast();

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const raw = XLSX.utils.sheet_to_json(ws);

        if (raw.length === 0) {
          setError('File rỗng hoặc không đúng định dạng!');
          return;
        }

        // Mapping and validation
        const mapped = raw.map(item => ({
          name: item['Họ tên'] || item['Name'] || item['Tên'],
          phone: String(item['Số điện thoại'] || item['SĐT'] || item['Phone'] || '').trim(),
          zalo: String(item['Zalo'] || item['Zalo Number'] || '').trim() || String(item['Số điện thoại'] || item['SĐT'] || item['Phone'] || '').trim(),
          course: item['Khóa học'] || item['Course'] || '',
          price: Number(item['Học phí'] || item['Price'] || 0),
          paid: (item['Đã đóng'] || item['Paid']) === 'x' || (item['Đã đóng'] || item['Paid']) === 'v' || !!item['Paid'],
          learningMode: item['Hình thức'] || item['Mode'] || 'OFFLINE',
          address: item['Địa chỉ'] || item['Address'] || '',
        })).filter(s => s.name);

        setData(mapped);
        setStep('preview');
        setError(null);
      } catch (err) {
        setError('Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const startImport = async () => {
    setStep('importing');
    try {
      const res = await api.students.importBulk(data);
      if (res.success) {
        setStats({ total: data.length, success: res.count });
        setStep('success');
        mutate(['admin_stats', branchId]);
        toast.success(`Nhập thành công ${res.count} học viên!`);
      } else {
        setError(res.message);
        setStep('upload');
      }
    } catch (err) {
      setError('Lỗi hệ thống khi nhập dữ liệu.');
      setStep('upload');
    }
  };

  const downloadTemplate = () => {
    const template = [
      { 'Họ tên': 'NGUYỄN VĂN A', 'Số điện thoại': '0912345678', 'Zalo': '0912345678', 'Khóa học': 'THVP NÂNG CAO', 'Học phí': 1500000, 'Đã đóng': 'x', 'Hình thức': 'OFFLINE', 'Địa chỉ': 'Hà Nội' },
      { 'Họ tên': 'TRẦN THỊ B', 'Số điện thoại': '0987654321', 'Zalo': '0987654321', 'Khóa học': 'MOS EXCEL', 'Học phí': 1200000, 'Đã đóng': '', 'Hình thức': 'ONLINE', 'Địa chỉ': 'Hồ Chí Minh' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Mau_Nhap_Hoc_Vien.xlsx");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl relative z-10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="bg-emerald-600 p-6 flex items-center justify-between text-white">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                 <FileSpreadsheet size={24} />
              </div>
              <div>
                 <h3 className="font-black uppercase tracking-widest text-sm">Nhập Học Viên Từ Excel</h3>
                 <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest">Bulk Import Module</p>
              </div>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition">
             <X size={20} />
           </button>
        </div>

        <div className="p-8 flex-1 min-h-[300px] flex flex-col">
          
          {step === 'upload' && (
            <div className="space-y-6 flex-1 flex flex-col items-center justify-center text-center">
               <div 
                 onClick={() => fileInputRef.current.click()}
                 className="w-full h-48 border-4 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center gap-4 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all cursor-pointer group"
               >
                  <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                    <Upload size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-700">Kéo thả file hoặc Click để tải lên</p>
                    <p className="text-xs text-slate-400 font-bold">Hỗ trợ định dạng .xlsx, .xls</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
               </div>

               {error && (
                 <div className="bg-red-50 text-red-600 p-3 rounded-2xl border border-red-100 flex items-center gap-2 text-xs font-bold w-full">
                    <AlertCircle size={14} /> {error}
                 </div>
               )}

               <div className="w-full pt-4 space-y-3">
                 <button 
                  onClick={downloadTemplate}
                  className="w-full py-4 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition"
                 >
                   <Download size={14} /> Tải file mẫu chuẩn
                 </button>
                 <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold justify-center uppercase tracking-tighter italic">
                    <Info size={12} /> Dữ liệu trùng SĐT sẽ được bỏ qua tự động
                 </div>
               </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6 flex-1 flex flex-col">
               <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                  <Table size={20} className="text-amber-600" />
                  <div>
                    <p className="text-xs font-black text-amber-900">Xem trước dữ liệu</p>
                    <p className="text-[10px] font-bold text-amber-600">Tìm thấy {data.length} bản ghi sẵn sàng nhập</p>
                  </div>
               </div>

               <div className="flex-1 max-h-64 overflow-y-auto rounded-2xl border border-slate-100">
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-left text-xs min-w-[500px]">
                       <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                          <tr>
                             <th className="p-3 font-black text-slate-400 uppercase">Họ tên</th>
                             <th className="p-3 font-black text-slate-400 uppercase">SĐT/Zalo</th>
                             <th className="p-3 font-black text-slate-400 uppercase">Khóa học</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {data.slice(0, 10).map((s, i) => (
                             <tr key={i} className="hover:bg-slate-50 transition">
                                <td className="p-3 font-black text-slate-700 whitespace-nowrap">{s.name}</td>
                                <td className="p-3 font-medium text-slate-500 font-mono whitespace-nowrap">{s.phone}</td>
                                <td className="p-3 font-bold text-emerald-600 uppercase whitespace-nowrap">{s.course}</td>
                             </tr>
                          ))}
                          {data.length > 10 && (
                            <tr><td colSpan={3} className="p-3 text-center text-slate-400 font-black tracking-widest text-[9px]">VÀ {data.length - 10} BẢN GHI KHÁC...</td></tr>
                          )}
                       </tbody>
                    </table>
                  </div>
               </div>

               <div className="flex gap-3">
                  <button onClick={() => setStep('upload')} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 transition">Quay lại</button>
                  <button onClick={startImport} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center justify-center gap-2">
                    Bắt đầu nhập dữ liệu <ChevronRight size={14} />
                  </button>
               </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
               <div className="relative">
                  <Loader2 size={64} className="text-emerald-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileSpreadsheet size={24} className="text-emerald-600 animate-pulse" />
                  </div>
               </div>
               <div className="text-center">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Đang xử lý dữ liệu</h4>
                  <p className="text-xs text-slate-400 font-bold mt-1">Đang mã hóa và đẩy {data.length} bản ghi lên máy chủ...</p>
               </div>
            </div>
          )}

          {step === 'success' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-in fade-in duration-700">
               <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[40px] flex items-center justify-center shadow-inner">
                  <CheckCircle2 size={48} className="animate-bounce" />
               </div>
               <div className="text-center space-y-2">
                  <h4 className="text-2xl font-black text-slate-900 tracking-tight">Thành Công!</h4>
                  <p className="text-sm font-bold text-slate-500">
                    Đã hoàn tất nhập <span className="text-emerald-600">{stats.success}</span>/{stats.total} học viên.
                  </p>
                  {stats.total > stats.success && (
                    <p className="text-[10px] text-amber-500 font-bold uppercase">{stats.total - stats.success} bản ghi trùng lặp đã bị loại bỏ.</p>
                  )}
               </div>
               <button 
                onClick={onClose} 
                className="w-full py-4 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition shadow-xl"
               >
                 Về danh sách
               </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
