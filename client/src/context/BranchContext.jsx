/**
 * BranchContext.jsx — Global Branch Filter Context cho SUPER_ADMIN
 * 
 * Cung cấp selectedBranch state dùng chung toàn ứng dụng.
 * STAFF không cần — backend tự lock theo branchId của họ.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const BranchContext = createContext({
  selectedBranchId: 'all',
  selectedBranchName: 'Tất cả chi nhánh',
  branches: [],
  setSelectedBranch: () => {},
  branchQueryParam: '',        // '?branch_id=xxx' hoặc ''
  isLoadingBranches: false,
});

const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");

function getToken() {
  for (const role of ['admin', 'staff']) {
    const t = localStorage.getItem(`${role}_access_token`);
    if (t) return t;
    const s = localStorage.getItem(`${role}_user`);
    if (s) { try { const u = JSON.parse(s); if (u?.token) return u.token; } catch {} }
  }
  return '';
}

export function BranchProvider({ session, children }) {
  const [selectedBranchId,   setSelectedBranchId]   = useState('all');
  const [selectedBranchName, setSelectedBranchName] = useState('Tất cả chi nhánh');
  const [branches,           setBranches]            = useState([]);
  const [isLoadingBranches,  setIsLoadingBranches]   = useState(false);

  const isSuperAdmin = session?.id === 'admin' || session?.adminRole === 'SUPER_ADMIN';
  const isStaff      = session?.adminRole === 'STAFF';
  const staffBranchId = session?.branchId;

  // 🛡️ ARCHITECTURAL LOCK: STAFF luôn bị khóa tại chi nhánh của họ
  useEffect(() => {
    if (isStaff && staffBranchId) {
      setSelectedBranchId(staffBranchId);
      // Tìm tên chi nhánh nếu có trong list
      const br = branches.find(b => String(b._id) === String(staffBranchId));
      if (br) setSelectedBranchName(br.name);
    }
  }, [isStaff, staffBranchId, branches]);

  // Load branches khi mount (dùng chung để map tên chi nhánh)
  useEffect(() => {
    setIsLoadingBranches(true);
    fetch(`${API}/api/branches`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setBranches(res.data || []);
          localStorage.setItem('thvp_branches', JSON.stringify(res.data || []));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingBranches(false));
  }, []);

  const setSelectedBranch = useCallback((id, name) => {
    // Nếu là STAFF, không cho phép đổi chi nhánh
    if (isStaff) return;
    
    setSelectedBranchId(id || 'all');
    setSelectedBranchName(name || 'Tất cả chi nhánh');
  }, [isStaff]);

  const branchQueryParam = selectedBranchId && selectedBranchId !== 'all'
    ? `branch_id=${selectedBranchId}`
    : '';

  return (
    <BranchContext.Provider value={{
      selectedBranchId,
      selectedBranchName,
      branches,
      setSelectedBranch,
      branchQueryParam,
      isLoadingBranches,
      isSuperAdmin,
      isStaff,
    }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}
