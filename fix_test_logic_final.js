const fs = require('fs');

const path = 'client/src/components/StudentTest.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Rewrite handleSubmitFinal
const handleSubmitStr = `  const handleSubmitFinal = () => {
    // Only stop timer when both are done or when time is up. 
    // Here we just mark Trac nghiem as done.
    setIsTracNghiemSubmitted(true);
    setTab('tu_luan'); // Auto switch to Tu luan
  };`;
const handleSubmitNew = `  const handleSubmitFinal = () => {
    const finalScore = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
    const finalPct = Math.round((finalScore / TOTAL) * 100);
    const passedTN = finalPct >= 50;

    setIsTracNghiemSubmitted(true);

    if (!passedTN) {
       clearInterval(timerRef.current);
       updateExamProgress({
           tracNghiem: { score: finalScore, total: TOTAL },
           thucHanh: 'chua_nop',
           status: 'khong_dat',
           lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
       });
       setPhase('result');
    } else {
       updateExamProgress({
           tracNghiem: { score: finalScore, total: TOTAL },
           status: 'dang_thi'
       });
       setTab('tu_luan');
    }
  };`;
content = content.replace(handleSubmitStr, handleSubmitNew);

// 2. Rewrite handleFinalTuLuan
const handleFinalTuLuanStr = `  const handleFinalTuLuan = () => {
    clearInterval(timerRef.current);
    setPhase('result');
  };`;
const handleFinalTuLuanNew = `  const handleFinalTuLuan = () => {
    clearInterval(timerRef.current);
    const finalScore = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
    const finalPct = Math.round((finalScore / TOTAL) * 100);
    const isPassedThucHanh = uploadDone;
    const isPassedTotal = finalPct >= 50 && isPassedThucHanh;

    updateExamProgress({
       thucHanh: isPassedThucHanh ? 'da_nop' : 'chua_nop',
       status: isPassedTotal ? 'dat' : 'khong_dat',
       lockUntil: isPassedTotal ? null : Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    setPhase('result');
  };`;
content = content.replace(handleFinalTuLuanStr, handleFinalTuLuanNew);

// 3. Remove "Upload thuc hanh" block from phase === 'result'
// We use a regex to match from {/* Upload thực hành */} down to block close, before the "Về phòng thi" button.
content = content.replace(
  /\{\/\* Upload thực hành \*\/\}\s*<div className="bg-white rounded-2xl border p-5">[\s\S]*?<\/div>\s*<button onClick=\{\(\) => onBack\?\.\(\)\} className="w-full py-3 bg-gray-800 hover:bg-black/,
  `<button onClick={() => onBack?.()} className="w-full py-3 bg-gray-800 hover:bg-black`
);


// 4. Update the student loading to set 'dang_thi' on init if 'chua_thi'
const timerEffectRegex = /useEffect\(\(\) => \{\s*if \(phase !== 'test'\) return;\s*timerRef\.current = setInterval\(\(\) => \{/;
const initDangThi = `useEffect(() => {
    if (phase === 'test' && student && updateStudent) {
      const prog = student.examProgress?.find(s => s.id === subjectId);
      if (!prog || prog.status === 'chua_thi') {
         updateExamProgress({ status: 'dang_thi' });
      }
    }
  }, []);

  `;
content = content.replace(timerEffectRegex, initDangThi + `useEffect(() => {
    if (phase !== 'test') return;
    timerRef.current = setInterval(() => {`);

fs.writeFileSync(path, content, 'utf8');
console.log("Updated complete logic");
