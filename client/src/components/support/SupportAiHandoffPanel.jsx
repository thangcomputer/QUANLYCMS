import React, { useCallback, useEffect, useState } from 'react';
import { Headphones, Loader2 } from 'lucide-react';
import { aiSupportAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { AI_SUPPORT_STATUS, handoffReasonLabel } from '../../utils/aiSupport';

function statusLabel(status) {
  if (status === AI_SUPPORT_STATUS.SUPPORT_ACTIVE) return 'Đang hỗ trợ';
  if (status === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT) return 'Chờ nhận';
  return status || '';
}

/**
 * Hàng đợi handoff AI → Support. Chỉ render khi adminRole === SUPPORT.
 * Không thêm AI assistant vào dashboard Support.
 */
export default function SupportAiHandoffPanel({ onOpen, onQueueChange }) {
  const { socket } = useSocket() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await aiSupportAPI.queue();
      if (res?.success && Array.isArray(res.data)) setItems(res.data);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onQueueChange?.(items);
  }, [items, onQueueChange]);

  useEffect(() => {
    if (!socket) return undefined;
    const bump = () => load();
    socket.on('ai-support:escalate', bump);
    socket.on('ai-support:status', bump);
    socket.on('ai-support:user-message', bump);
    socket.on('ai-support:support_claimed', bump);
    socket.on('ai-support:support_resolved', bump);
    return () => {
      socket.off('ai-support:escalate', bump);
      socket.off('ai-support:status', bump);
      socket.off('ai-support:user-message', bump);
      socket.off('ai-support:support_claimed', bump);
      socket.off('ai-support:support_resolved', bump);
    };
  }, [socket, load]);

  if (!loading && items.length === 0) return null;

  return (
    <div className="px-3 pt-3 pb-1">
      <p className="text-[10px] font-black uppercase tracking-wide text-amber-700 px-1 mb-1.5 flex items-center gap-1.5">
        <Headphones size={12} />
        Yêu cầu từ Trợ lý AI
      </p>
      {loading ? (
        <div className="flex justify-center py-3 text-slate-400">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.conversationId}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="w-full text-left px-2.5 py-2 rounded-xl border border-amber-100 bg-amber-50/70 hover:bg-amber-50 transition-colors"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-slate-800 truncate">
                    {item.userName || 'Học viên / Giảng viên'}
                  </span>
                  <span className="text-[10px] font-black uppercase text-amber-800 shrink-0">
                    {statusLabel(item.status)}
                  </span>
                </span>
                <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                  {item.lastMessage || handoffReasonLabel(item.handoffReason)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
