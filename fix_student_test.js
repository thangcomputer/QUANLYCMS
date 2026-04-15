const fs = require('fs');

const path = 'client/src/components/StudentTest.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject isTracNghiemSubmitted
content = content.replace(
  "const [tab, setTab]           = useState('trac_nghiem');",
  "const [tab, setTab]           = useState('trac_nghiem');\n  const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);"
);

// 2. Change logic for handleSubmitFinal
// When trac nghiem is submitted, instead of going to phase = 'result', we stay in phase = 'test'
// and set isTracNghiemSubmitted = true
// Wait, the timer should probably still run for Tu luan? Yes, the time is global. Or does Tu Luan have a separate timer?
// Let's just set isTracNghiemSubmitted = true and switch to 'tu_luan' tab or stay on 'trac_nghiem' to review.

const targetSubmitLogic = `  const handleSubmitFinal = () => {
    clearInterval(timerRef.current);
    setPhase('result');
  };`;

const newSubmitLogic = `  const handleSubmitFinal = () => {
    // Only stop timer when both are done or when time is up. 
    // Here we just mark Trac nghiem as done.
    setIsTracNghiemSubmitted(true);
    setTab('tu_luan'); // Auto switch to Tu luan
  };
  
  const handleFinalTuLuan = () => {
    clearInterval(timerRef.current);
    setPhase('result');
  };`;
content = content.replace(targetSubmitLogic, newSubmitLogic);

// 3. Tab buttons UI disabled logic
const targetTabs = `          <div className="flex border-b border-gray-100">
            {[
              { id: 'trac_nghiem', label: '📝 Trắc nghiệm' },
              { id: 'tu_luan',     label: '🖥 Tự luận' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={\`flex-1 py-3.5 text-sm font-semibold transition-all \${
                  tab === t.id
                    ? 'text-gray-800 bg-white border-b-0'
                    : 'text-gray-400 bg-gray-50/50 hover:text-gray-600'
                }\`}
              >
                {t.label}
              </button>
            ))}
          </div>`;

const newTabs = `          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('trac_nghiem')}
              className={\`flex-1 py-3.5 text-sm font-semibold transition-all \${
                tab === 'trac_nghiem' ? 'text-gray-800 bg-white border-b-0' : 'text-gray-400 bg-gray-50/50 hover:text-gray-600'
              }\`}
            >
              📝 Trắc nghiệm
            </button>
            <button
              onClick={() => {
                if (isTracNghiemSubmitted) setTab('tu_luan');
              }}
              disabled={!isTracNghiemSubmitted}
              className={\`flex-1 py-3.5 text-sm font-semibold transition-all \${
                !isTracNghiemSubmitted ? 'opacity-50 cursor-not-allowed text-gray-400 bg-gray-100' :
                tab === 'tu_luan' ? 'text-gray-800 bg-white border-b-0' : 'text-gray-400 bg-gray-50/50 hover:text-gray-600'
              }\`}
            >
              🖥 Tự luận {\!isTracNghiemSubmitted && '(Chưa nộp trắc nghiệm)'}
            </button>
          </div>`;
content = content.replace(targetTabs, newTabs);


// 4. Update Footer for trySubmit (Trắc nghiệm submission)
// We still use it as is, but it will call handleSubmitFinal. 
// However, what if they click submit again? Let's hide the submit button if isTracNghiemSubmitted.
const targetTracNghiemFooter = `{/* ══════════ FOOTER: Nộp trắc nghiệm ══════════ */}
      {tab === 'trac_nghiem' && (
        <div className="px-3 md:px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Đã làm: <span className={\`font-bold \${answeredCount === TOTAL ? 'text-green-600' : 'text-orange-500'}\`}>{answeredCount}/{TOTAL}</span>
          </span>
          <button
            onClick={trySubmit}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-green-100"
          >
            <CheckCircle size={15}/> NỘP BÀI TRẮC NGHIỆM
          </button>
        </div>
      )}`;

const newTracNghiemFooter = `{/* ══════════ FOOTER: Nộp trắc nghiệm ══════════ */}
      {tab === 'trac_nghiem' && !isTracNghiemSubmitted && (
        <div className="px-3 md:px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Đã làm: <span className={\`font-bold \${answeredCount === TOTAL ? 'text-green-600' : 'text-orange-500'}\`}>{answeredCount}/{TOTAL}</span>
          </span>
          <button
            onClick={trySubmit}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-green-100"
          >
            <CheckCircle size={15}/> NỘP BÀI TRẮC NGHIỆM
          </button>
        </div>
      )}`;
content = content.replace(targetTracNghiemFooter, newTracNghiemFooter);


// 5. In the final result phase, we already have the review logic. But in Trac Nghiem tab after submission, maybe they cannot answer?
const targetQuestionOptions = `              <div className="space-y-2.5">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(currentQ, i)}
                    className={\`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl border text-left transition-all \${
                      answers[currentQ] === i
                        ? 'border-transparent bg-gray-900 text-white shadow-lg'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm text-gray-700'
                    }\`}
                  >`;

const newQuestionOptions = `              <div className="space-y-2.5">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => { if (!isTracNghiemSubmitted) handleAnswer(currentQ, i); }}
                    disabled={isTracNghiemSubmitted}
                    className={\`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl border text-left transition-all \${
                      answers[currentQ] === i
                        ? 'border-transparent bg-gray-900 text-white shadow-lg'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm text-gray-700'
                    } \${isTracNghiemSubmitted && answers[currentQ] === i ? 'opacity-80' : isTracNghiemSubmitted ? 'opacity-50' : ''}\`}
                  >`;
content = content.replace(targetQuestionOptions, newQuestionOptions);

// 6. When TuLuan is submitted via ConfirmModal!
const targetTuLuanSubmit = `onConfirm={() => { setShowNoFileConfirm(false); setUploadDone(true); updateExamProgress({ thucHanh: 'chua_nop' }); }}`;
const newTuLuanSubmit = `onConfirm={() => { setShowNoFileConfirm(false); setUploadDone(true); updateExamProgress({ thucHanh: 'chua_nop' }); handleFinalTuLuan(); }}`;
content = content.replace(targetTuLuanSubmit, newTuLuanSubmit);

// Wait, the original direct submit was:
const targetTrySubmitTuLuan = `  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else { setUploadDone(true); }
  };`;

const newTrySubmitTuLuan = `  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else { setUploadDone(true); handleFinalTuLuan(); }
  };`;
content = content.replace(targetTrySubmitTuLuan, newTrySubmitTuLuan);


fs.writeFileSync(path, content, 'utf8');
console.log("Replaced StudentTest logic!");
