const fs = require('fs');
const path = 'client/src/components/StudentTest.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. IS_TRAC_NGHIEM_SUBMITTED State initialization (might have been removed by git checkout? No, fix_real doesn't add it either! Oh wait! Did fix_real add the state declaration?)
if (!content.includes('const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);')) {
  // Let's ensure the state exists.
  content = content.replace("const [tab, setTab]           = useState('trac_nghiem');", "const [tab, setTab]           = useState('trac_nghiem');\n  const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);");
}

// 2. The tabs
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

// 3. Question options 
const targetOptions = `                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(currentQ, i)}
                    className={\`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl border text-left transition-all \${
                      answers[currentQ] === i
                        ? 'border-transparent bg-gray-900 text-white shadow-lg'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm text-gray-700'
                    }\`}
                  >`;

const newOptions = `                {q.options.map((opt, i) => (
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

// 4. Footer Hide Nop Trac Nghiem
const targetFooter = `{/* ══════════ FOOTER: Nộp trắc nghiệm ══════════ */}
      {tab === 'trac_nghiem' && (`;

const newFooter = `{/* ══════════ FOOTER: Nộp trắc nghiệm ══════════ */}
      {tab === 'trac_nghiem' && !isTracNghiemSubmitted && (`;

// 5. Submit Tu Luan Button
const targetSubmitTuLuanBtn = `<button onClick={() => { if (!uploadFile) return; setUploadDone(true); }} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm">Nộp bài tự luận</button>`;
const newSubmitTuLuanBtn = `<button onClick={() => { if (!uploadFile) return; setUploadDone(true); handleFinalTuLuan(); }} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm">Nộp bài tự luận</button>`;


content = content.replace(targetTabs.replace(/\r/g, ''), newTabs);
content = content.replace(targetTabs, newTabs);

content = content.replace(targetOptions.replace(/\r/g, ''), newOptions);
content = content.replace(targetOptions, newOptions);

content = content.replace(targetFooter.replace(/\r/g, ''), newFooter);
content = content.replace(targetFooter, newFooter);

content = content.replace(targetSubmitTuLuanBtn.replace(/\r/g, ''), newSubmitTuLuanBtn);
content = content.replace(targetSubmitTuLuanBtn, newSubmitTuLuanBtn);

fs.writeFileSync(path, content, 'utf8');
console.log("fixed UI for student test tabs");
