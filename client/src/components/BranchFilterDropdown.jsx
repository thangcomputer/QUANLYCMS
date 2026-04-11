/**
 * BranchFilterDropdown.jsx — Dropdown chọn Chi nhánh toàn cục (Topbar)
 * Chỉ render khi user là SUPER_ADMIN VÀ đang ở module có phân vùng chi nhánh.
 * 
 * NHÓM 1 (HIỆN dropdown): Tổng quan, Học viên, Giảng viên, Đánh giá, Tài chính,
 *                          Nhật ký, Nhân sự & Lương, Báo cáo doanh thu.
 * NHÓM 2 (ẨN dropdown):   Đào tạo GV, Đào tạo HV, Phân quyền, Hộp thư, Cài đặt.
 */
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBranch } from '../context/BranchContext';

// ── Route config: Các hash/path ĐƯỢC PHÉP hiển thị dropdown ──────────────────
// Hash-based tabs trên /admin#xxx
const BRANCH_VISIBLE_HASHES = [
  'dashboard',       // Tổng quan
  'students',        // Học viên
  'teachers',        // Giảng viên
  'evaluations',     // Đánh giá nội bộ
  'finance',         // Tài chính
  'system-logs',     // Nhật ký hoạt động
  'hr',              // Nhân sự & Lương
  'analytics',       // Báo cáo doanh thu
];

// Hash/path nhóm 2 — ẨN dropdown (toàn cục, không phân vùng)
// training, student-training, staff-permissions, inbox, settings
// → Mọi hash KHÔNG nằm trong BRANCH_VISIBLE_HASHES sẽ tự động ẩn.

export default function BranchFilterDropdown() {
  const { selectedBranchId, selectedBranchName, branches, setSelectedBranch, isSuperAdmin, isLoadingBranches } = useBranch();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  // Chỉ hiện cho SUPER_ADMIN
  if (!isSuperAdmin) return null;

  // ── Xác định route hiện tại để ẩn/hiện ──
  // Path-based routes mà ẨN dropdown (không phân vùng chi nhánh)
  const HIDDEN_PATHS = ['/admin/inbox', '/admin/settings'];
  const isHiddenPath = HIDDEN_PATHS.some(p => location.pathname.startsWith(p));
  
  const currentHash = location.hash?.replace('#', '') || 'dashboard';
  const showDropdown = !isHiddenPath && BRANCH_VISIBLE_HASHES.includes(currentHash);

  // Đóng khi click ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Nếu route hiện tại thuộc nhóm 2 → ẩn dropdown
  if (!showDropdown) return null;

  const handleSelect = (id, name) => {
    setSelectedBranch(id, name);
    setOpen(false);
  };

  const activeBranches = branches.filter(b => b.isActive !== false);
  const isFiltered = selectedBranchId && selectedBranchId !== 'all';

  return (
    <div ref={ref} className="relative" style={{ zIndex: 50 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '10px',
          border: isFiltered ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
          background: isFiltered ? '#f0f0ff' : '#fff',
          color: isFiltered ? '#4f46e5' : '#475569',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          minWidth: '150px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <Building2 size={14} style={{ color: isFiltered ? '#4f46e5' : '#94a3b8', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isLoadingBranches ? 'Đang tải...' : selectedBranchName}
        </span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: '200px',
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Lọc theo chi nhánh
            </p>
          </div>

          {/* Tất cả */}
          <button
            onClick={() => handleSelect('all', 'Tất cả chi nhánh')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '9px 14px',
              background: !isFiltered ? '#f8f7ff' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: !isFiltered ? '#4f46e5' : '#374151',
              fontWeight: !isFiltered ? 700 : 500,
              fontSize: '13px',
              transition: 'background 0.1s',
            }}
          >
            <span>🏢 Tất cả chi nhánh</span>
            {!isFiltered && <Check size={13} color="#4f46e5" />}
          </button>

          {/* Chi nhánh list */}
          {activeBranches.length === 0 && (
            <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
              Chưa có chi nhánh
            </div>
          )}
          {activeBranches.map(b => {
            const isSelected = selectedBranchId === b._id;
            return (
              <button
                key={b._id}
                onClick={() => handleSelect(b._id, b.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '9px 14px',
                  background: isSelected ? '#f8f7ff' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isSelected ? '#4f46e5' : '#374151',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '13px',
                  transition: 'background 0.1s',
                  borderTop: '1px solid #f8fafc',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🏬 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  {b.code && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '1px 6px',
                      borderRadius: '99px', background: '#e0e7ff', color: '#4f46e5'
                    }}>{b.code}</span>
                  )}
                </span>
                {isSelected && <Check size={13} color="#4f46e5" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}

          {/* Badge filter active */}
          {isFiltered && (
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 14px' }}>
              <button
                onClick={() => handleSelect('all', 'Tất cả chi nhánh')}
                style={{
                  width: '100%', padding: '6px', borderRadius: '8px',
                  background: '#fef2f2', color: '#ef4444', border: 'none',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                ✕ Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
