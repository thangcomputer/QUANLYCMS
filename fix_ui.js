const fs = require('fs');

const path = 'client/src/components/StudentExamRoom.jsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `const SubjectCard = ({ subject, onStart, isGlobalApproved }) => {
  const meta = SUBJECT_ICONS[subject.id];
  const countdown = useCountdown(subject.lockUntil);

    const isApproved = isGlobalApproved || subject.meetsMilestone;

  const statusBadge = () => {
    switch (subject.status) {
      case 'dat':       return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ĐÃ ĐẠT</span>;
      case 'khong_dat': return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">KHÔNG ĐẠT</span>;
      case 'dang_khoa': return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">ĐANG KHÓA</span>;
      default:          return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">CHƯA THI</span>;
    }
  };

  const tracNghiemDisplay = () => {
    if (!subject.tracNghiem) return <span className="text-sm text-gray-400">Chưa làm</span>;
    const { score, total } = subject.tracNghiem;
    const pct = Math.round((score / total) * 100);
    return (
      <span className={\`text-sm font-semibold \${pct >= 50 ? 'text-green-600' : 'text-red-500'}\`}>
        {score}/{total}
      </span>
    );
  };

  const thucHanhDisplay = () => {
    if (subject.thucHanh === 'da_nop') return <span className="text-sm text-green-600 font-semibold">Đã nộp</span>;
    if (subject.thucHanh === 'chua_nop') return <span className="text-sm text-gray-400">Chưa nộp</span>;
    return <span className="text-sm text-red-500">Chưa nộp bài</span>;
  };

  const isLocked = subject.status === 'dang_khoa' || (subject.lockUntil && subject.lockUntil > Date.now());
  const canStart  = isApproved && !isLocked && subject.status === 'chua_thi';
  const canRetry  = isApproved && !isLocked && subject.status === 'khong_dat';
  const isPassed  = subject.status === 'dat';

  return (
    <div className={\`bg-white rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden \${
      !isApproved || isLocked ? 'opacity-80 border-gray-200 bg-gray-50' : 'hover:shadow-md'
    }\`}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Subject Icon */}
            <div className={\`w-12 h-12 \${(!isApproved || isLocked) ? 'bg-gray-200' : meta.bg} rounded-xl flex items-center justify-center shadow-sm transition-colors\`}>
              <span className={\`font-black text-xl \${(!isApproved || isLocked) ? 'text-gray-400' : 'text-white'}\`}>
                  {subject.id === 'word' ? 'W' : subject.id === 'excel' ? 'X' : subject.id === 'powerpoint' ? 'P' : 'C'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base leading-tight">{meta.label}</h3>
            </div>
          </div>
          {statusBadge()}
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileText size={14} />
              <span>Trắc nghiệm</span>
            </div>
            {tracNghiemDisplay()}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Monitor size={14} />
              <span>Thực hành</span>
            </div>
            {thucHanhDisplay()}
          </div>
        </div>
      </div>

      {/* Countdown if locked */}
      {subject.lockUntil && subject.lockUntil > Date.now() && (
        <div className="mx-5 mb-3 flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
          <Clock size={13} className="text-orange-500 flex-shrink-0" />
          <span className="text-xs text-orange-600 font-medium">Mở lại sau: {countdown}</span>
        </div>
      )}

      {/* Admin chưa duyệt hoặc chưa đủ mốc */}
      {!isApproved && (
        <div className="mx-5 mb-3 flex items-center justify-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5">
          <Lock size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-600 font-bold">Mở khóa sau {subject.requiredSessions || 0} buổi học</span>
        </div>
      )}
      {/* Action buttons */}
      <div className="px-5 pb-5 pt-2">
        {canStart && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-blue-100"
          >
            Vào thi ngay
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <Play size={15} /> Thi lại
          </button>
        )}
        {isPassed && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-green-100 hover:bg-green-200 text-green-700 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle size={15} /> Đã qua môn (Thi lại)
          </button>
        )}
      </div>
    </div>
  );
};`;

const newStr = `const SubjectCard = ({ subject, onStart, isGlobalApproved }) => {
  const meta = SUBJECT_ICONS[subject.id];
  const countdown = useCountdown(subject.lockUntil);

  const isApproved = isGlobalApproved || subject.meetsMilestone;
  const isLockedCountDown = subject.lockUntil && subject.lockUntil > Date.now();

  const statusBadge = () => {
    if (isLockedCountDown) {
      return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">RỚT</span>;
    }
    switch (subject.status) {
      case 'dat':       return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ĐẬU</span>;
      case 'khong_dat': return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">RỚT</span>;
      case 'dang_thi':  return <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">ĐANG THI</span>;
      case 'dang_khoa': return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">ĐANG KHÓA</span>;
      default:          return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">CHƯA THI</span>;
    }
  };

  const tracNghiemDisplay = () => {
    if (!subject.tracNghiem) return <span className="text-sm text-gray-400">Chưa làm</span>;
    const { score, total } = subject.tracNghiem;
    const pct = Math.round((score / total) * 100);
    return (
      <span className={\`text-sm font-semibold \${pct >= 50 ? 'text-green-600' : 'text-red-500'}\`}>
        {score}/{total}
      </span>
    );
  };

  const thucHanhDisplay = () => {
    if (subject.thucHanh === 'da_nop') return <span className="text-sm text-green-600 font-semibold">Đã nộp</span>;
    if (subject.thucHanh === 'chua_nop') return <span className="text-sm text-gray-400">Chưa nộp</span>;
    return <span className="text-sm text-red-500">Chưa nộp bài</span>;
  };

  const isLocked = subject.status === 'dang_khoa';
  const canStart  = isApproved && !isLocked && !isLockedCountDown && subject.status === 'chua_thi';
  const isOngoing = isApproved && !isLocked && !isLockedCountDown && subject.status === 'dang_thi';
  const canRetry  = isApproved && !isLocked && !isLockedCountDown && subject.status === 'khong_dat';
  const isPassed  = subject.status === 'dat';

  return (
    <div className={\`bg-white rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden \${
      !isApproved || isLocked || isLockedCountDown ? 'opacity-80 border-gray-200 bg-gray-50' : 'hover:shadow-md'
    }\`}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={\`w-12 h-12 \${(!isApproved || isLocked || isLockedCountDown) ? 'bg-gray-200' : meta.bg} rounded-xl flex items-center justify-center shadow-sm transition-colors\`}>
              <span className={\`font-black text-xl \${(!isApproved || isLocked || isLockedCountDown) ? 'text-gray-400' : 'text-white'}\`}>
                  {subject.id === 'word' ? 'W' : subject.id === 'excel' ? 'X' : subject.id === 'powerpoint' ? 'P' : 'C'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base leading-tight">{meta.label}</h3>
            </div>
          </div>
          {statusBadge()}
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileText size={14} />
              <span>Trắc nghiệm</span>
            </div>
            {tracNghiemDisplay()}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Monitor size={14} />
              <span>Thực hành</span>
            </div>
            {thucHanhDisplay()}
          </div>
        </div>
      </div>

      {/* Admin dkt */}
      {!isApproved && (
        <div className="mx-5 mb-3 flex items-center justify-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5">
          <Lock size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-600 font-bold">Mở khóa sau {subject.requiredSessions || 0} buổi học</span>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="px-5 pb-5 pt-2">
        {isLockedCountDown ? (
          <button
            disabled
            className="w-full py-2.5 bg-gray-100 border border-gray-200 text-gray-400 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 cursor-not-allowed uppercase tracking-wide"
          >
            <Clock size={15} /> Mở khóa sau: {countdown}
          </button>
        ) : (
          <>
            {canStart && (
              <button
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-blue-100"
              >
                Vào thi ngay
              </button>
            )}
            {canRetry && (
               <button
                 onClick={() => onStart(subject.id)}
                 className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-blue-100"
               >
                 <Play size={15} /> Vào thi ngay
               </button>
            )}
            {isOngoing && (
              <button
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-orange-100"
              >
                <Play size={15} /> Tiếp tục thi
              </button>
            )}
            {isPassed && (
              <button
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle size={15} /> Xem kết quả
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};`;

fs.writeFileSync(path, content.replace(targetStr, newStr), 'utf8');
console.log("Replaced SubjectCard in StudentExamRoom");
