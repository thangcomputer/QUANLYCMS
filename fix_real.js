const fs = require('fs');

const path = 'client/src/components/StudentTest.jsx';
let content = fs.readFileSync(path, 'utf8');

const t1 = `  const handleSubmitFinal = () => {
    clearInterval(timerRef.current);
    setPhase('result');
  };`;

const r1 = `  const handleSubmitFinal = () => {
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
  };

  const handleFinalTuLuan = () => {
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

const t2 = `  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else { setUploadDone(true); }
  };`;

const r2 = `  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else { setUploadDone(true); handleFinalTuLuan(); }
  };`;

content = content.replace(t1.replace(/\r/g, ''), r1);
content = content.replace(t1, r1);
content = content.replace(t2.replace(/\r/g, ''), r2);
content = content.replace(t2, r2);

fs.writeFileSync(path, content, 'utf8');
console.log("Replaced successfully!");
