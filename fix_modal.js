const fs = require('fs');
const path = 'client/src/components/StudentDetailModal.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Import useData if not already
if (!content.includes("from '../context/DataContext'")) {
  content = content.replace(
    "import { useModal } from '../utils/Modal.jsx';",
    "import { useModal } from '../utils/Modal.jsx';\nimport { useData } from '../context/DataContext';"
  );
}

// 2. Insert handleUnlockExams inside the component
if (!content.includes('const handleUnlockExams = async () => {')) {
  const hookLocation = "const [activeTab, setActiveTab] = useState('summary');";
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
}

// 3. Add button near Trophy
// We match the exact `<Trophy size={16} className="text-amber-500" />`
const regex = /(<h3[^>]+>\s*<Trophy size={16}[^>]+>\s*[^<]+<\/h3>)/;
content = content.replace(regex, `<div className="flex items-center justify-between">
                         $1
                         {data.student.examProgress?.some(p => p.lockUntil) && (
                           <button 
                             onClick={handleUnlockExams}
                             className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                           >
                             Gỡ khóa thi lại
                           </button>
                         )}
                       </div>`);

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed StudentDetailModal");
