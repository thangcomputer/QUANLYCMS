import React, { useState, useEffect } from 'react';
import { BellRing, Video, Clock, X, Wifi } from 'lucide-react';

const ClassReminder = ({ nextClassTime, linkHoc, studentName, courseName }) => {
  const [minutesLeft, setMinutesLeft] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!nextClassTime || dismissed) return;

    const checkTime = () => {
      const now = new Date();
      const classTime = new Date(nextClassTime);
      const diffInMs = classTime - now;
      const diffInMins = Math.floor(diffInMs / 60000);

      setMinutesLeft(diffInMins);

      // Hiện banner nếu còn ≤30 phút và chưa quá 15 phút
      if (diffInMins <= 30 && diffInMins > -15) {
        setShowBanner(true);
      } else {
        setShowBanner(false);
      }
    };

    const timer = setInterval(checkTime, 30000); // Mỗi 30 giây
    checkTime();

    return () => clearInterval(timer);
  }, [nextClassTime, dismissed]);

  if (!showBanner || dismissed) return null;

  const isUrgent = minutesLeft !== null && minutesLeft <= 5;
  const isLive   = minutesLeft !== null && minutesLeft <= 0;

  return (
    <div className="fixed top-0 left-0 w-full z-[9999]"
      style={{ animation: 'slideDown 0.4s ease-out' }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
          50%      { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }
      `}</style>

      <div className={`${isLive ? 'bg-gradient-to-r from-green-600 to-green-500' : isUrgent ? 'bg-gradient-to-r from-red-700 to-red-600' : 'bg-gradient-to-r from-red-600 to-orange-500'} text-white shadow-2xl`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Left */}
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div
              className="bg-white/20 p-2.5 rounded-full flex-shrink-0"
              style={isUrgent ? { animation: 'pulseGlow 1.5s infinite' } : {}}
            >
              {isLive ? <Wifi size={20} className="animate-pulse" /> : <BellRing size={20} />}
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm sm:text-base uppercase tracking-tight truncate">
                {isLive
                  ? '🔴 ĐANG DIỄN RA — Vào lớp ngay!'
                  : isUrgent
                    ? `⚡ CÒN ${minutesLeft} PHÚT — Vào lớp ngay!`
                    : `📚 Sắp đến giờ vào lớp! (Còn ${minutesLeft} phút)`
                }
              </p>
              <p className="text-[11px] opacity-80 font-medium truncate">
                {courseName && <span>{courseName} · </span>}
                {studentName && <span>Học viên: {studentName} · </span>}
                Chuẩn bị đường truyền ổn định.
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {linkHoc && (
              <a
                href={linkHoc}
                target="_blank"
                rel="noreferrer"
                className={`${isLive ? 'bg-white text-green-700' : 'bg-white text-red-600'} px-4 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 hover:opacity-90 transition-all shadow-lg`}
              >
                <Video size={16} /> VÀO LỚP NGAY
              </a>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="opacity-60 hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassReminder;
