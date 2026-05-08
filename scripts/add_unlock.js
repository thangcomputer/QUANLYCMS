const fs = require('fs');
const path = 'client/src/components/StudentDetailModal.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Import useData
content = content.replace(
  "import { useModal } from '../utils/Modal.jsx';",
  "import { useModal } from '../utils/Modal.jsx';\nimport { useData } from '../context/DataContext';"
);

// 2. Extract updateStudent and create function
const hookLocation = "const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'attendance' | 'finance' | 'academic'";
const functionCode = `
  const { updateStudent } = useData() || {};
  const handleUnlockExams = async () => {
    if (!data.student || !data.student.examProgress || !updateStudent) return;
    const newProgress = data.student.examProgress.map(s => {
      if (s.lockUntil) {
         return { ...s, lockUntil: null };
      }
      return s;
    });
    
    try {
      await updateStudent(data.student._id || data.student.id, { examProgress: newProgress });
      setData({ ...data, student: { ...data.student, examProgress: newProgress } });
      showModal({
        title: 'Thành công',
        content: 'Đã gỡ bỏ đếm ngược 7 ngày! Học viên có thể thi lại ngay.',
        type: 'success'
      });
    } catch (err) {}
  };
`;
content = content.replace(hookLocation, hookLocation + '\n' + functionCode);

// 3. Add button to Academic Tab
const targetString = `<h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                         <Trophy size={16} className="text-amber-500" /> Kết quả thi tốt nghiệp
                       </h3>`;
const replaceString = `<div className="flex items-center justify-between">
                         <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                           <Trophy size={16} className="text-amber-500" /> Kết quả thi tốt nghiệp
                         </h3>
                         {data.student.examProgress?.some(p => p.lockUntil) && (
                           <button 
                             onClick={handleUnlockExams}
                             className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                           >
                             Gỡ khóa thi lại
                           </button>
                         )}
                       </div>`;
                       
content = content.replace(targetString, replaceString);

fs.writeFileSync(path, content, 'utf8');
console.log("Added handleUnlockExams to StudentDetailModal");
