// ═══════════════════════════════════════════════════════════════════════════════
// API Service — Kết nối Frontend ↔ Backend (v3.0)
// ═══════════════════════════════════════════════════════════════════════════════

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const SOCKET_BASE = API_BASE.replace('/api', '');

// ── Token Management ──────────────────────────────────────────────────────────
export const getRolePrefix = (overrideRole = null) => {
  if (overrideRole) return overrideRole;
  if (typeof window === 'undefined') return 'thvp';
  const path = window.location.pathname;

  // Cho route /admin, phân biệt admin vs staff dựa trên session lưu trong localStorage
  if (path.startsWith('/admin')) {
    // Staff login lưu dưới staff_user, admin lưu dưới admin_user
    // Ưu tiên: nếu có staff_user và không có admin_user → đây là staff
    if (localStorage.getItem('staff_user') && !localStorage.getItem('admin_user')) return 'staff';
    if (localStorage.getItem('admin_user')) return 'admin';
    // Fallback: check staff trước
    if (localStorage.getItem('staff_access_token')) return 'staff';
    return 'admin';
  }
  if (path.startsWith('/teacher')) return 'teacher';
  if (path.startsWith('/student')) return 'student';
  
  // Fallback: tìm session nào đang tồn tại
  if (localStorage.getItem('admin_user')) return 'admin';
  if (localStorage.getItem('staff_user')) return 'staff';
  if (localStorage.getItem('teacher_user')) return 'teacher';
  if (localStorage.getItem('student_user')) return 'student';
  
  return 'thvp';
};

const getAccessToken = (role) => {
  const prefix = getRolePrefix(role);
  // Ưu tiên key cũ (prefix_access_token)
  const directToken = localStorage.getItem(`${prefix}_access_token`);
  if (directToken) return directToken;
  // Fallback: đọc từ session object (format mới: role_user.token)
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    if (session?.token) return session.token;
  } catch {}
  return null;
};
const getRefreshToken = (role) => {
  const prefix = getRolePrefix(role);
  const directToken = localStorage.getItem(`${prefix}_refresh_token`);
  if (directToken) return directToken;
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    if (session?.refreshToken) return session.refreshToken;
  } catch {}
  return null;
};

export const setTokens = (access, refresh, role) => {
  const prefix = getRolePrefix(role);
  if (access)  localStorage.setItem(`${prefix}_access_token`, access);
  else         localStorage.removeItem(`${prefix}_access_token`);
  if (refresh) localStorage.setItem(`${prefix}_refresh_token`, refresh);
  else         localStorage.removeItem(`${prefix}_refresh_token`);
};

export const clearTokens = (role) => {
  const prefix = getRolePrefix(role);
  localStorage.removeItem(`${prefix}_access_token`);
  localStorage.removeItem(`${prefix}_refresh_token`);
  localStorage.removeItem(`${prefix}_user`);
};

// ── Core Fetch Helper ─────────────────────────────────────────────────────────
export const apiFetch = async (endpoint, options = {}) => {
  const url     = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  const activeToken = getAccessToken();
  if (activeToken && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });

    // ⭐ Fix 1: Detect concurrent login / token revoked BEFORE trying refresh
    if (res.status === 401 && !options.skipAuth) {
      const cloned = res.clone();
      try {
        const errBody = await cloned.json();
        if (errBody.code === 'TOKEN_VERSION_MISMATCH') {
          // Tài khoản đăng nhập ở thiết bị khác → văng ra login
          localStorage.clear();
          sessionStorage.clear();
          alert('⚠️ Tài khoản đã đăng nhập ở thiết bị khác. Phiên này bị vô hiệu.');
          window.location.href = '/login';
          return res; // won't reach
        }
        if (errBody.code === 'TOKEN_REVOKED') {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = '/login';
          return res;
        }
      } catch { /* body parse failed, continue with normal flow */ }
    }

    // Token expired — try silent refresh (Fix 4: đã có sẵn)
    if (res.status === 401 && getRefreshToken() && !options._retried) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${getAccessToken()}`;
        return fetch(url, { ...options, headers, _retried: true });
      }
    }

    if (res.status === 401 && !options.skipAuth) {
      const error = new Error('Unauthorized');
      error.status = 401;
      throw error;
    }

    return res;
  } catch (err) {
    if (err.status !== 401 || options.skipAuth) {
      console.error(`[API] ${options.method || 'GET'} ${endpoint} failed:`, err);
    }
    throw err;
  }
};

const refreshAccessToken = async () => {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: getRefreshToken() }),
    });
    if (res.ok) {
      const data = await res.json();
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH API
// ═══════════════════════════════════════════════════════════════════════════════

export const authAPI = {
  login: async (phone, password, role = 'teacher') => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password, role }),
      skipAuth: true,
    });
    if (!res.ok) {
       const errData = await res.json().catch(() => ({}));
       return { success: false, message: errData.message || 'Sai tài khoản hoặc mật khẩu', isBan: errData.isBan };
    }
    const data = await res.json();
    if (data.success && data.data) {
      const actualRole = data.data.user?.role || data.data.role || role;
      setTokens(data.data.accessToken, data.data.refreshToken, actualRole);
    }
    return data;
  },

  registerTeacher: async (formData) => {
    const res = await apiFetch('/auth/register-teacher', {
      method: 'POST',
      body: JSON.stringify(formData),
      skipAuth: true,
    });
    return res.json();
  },

  logout: async () => {
    const prefix = getRolePrefix();
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || '{}');
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ userId: session.id, role: session.role }),
      });
    } catch { /* ignore */ }
    clearTokens();
  },

  // Verify token on mount — khôi phục session sau reload
  me: async () => {
    const res = await apiFetch('/auth/me');
    if (!res.ok) return { success: false };
    return res.json();
  },

  changePassword: async (userId, role, oldPassword, newPassword) => {
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ userId, role, oldPassword, newPassword }),
    });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENTS API
// ═══════════════════════════════════════════════════════════════════════════════

export const studentsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students${q ? `?${q}` : ''}`);
    return res.json();
  },

  payTeacher: async (id, action) => {
    const res = await apiFetch(`/students/${id}/pay-teacher`, {
      method: 'PUT',
      body: JSON.stringify({ action }),
    });
    return res.json();
  },

  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students/stats${q ? `?${q}` : ''}`);
    return res.json();
  },

  getById: async (id) => {
    const res = await apiFetch(`/students/${id}`);
    return res.json();
  },

  create: async (student) => {
    const res = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify(student),
    });
    return res.json();
  },

  update: async (id, updates) => {
    const res = await apiFetch(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  delete: async (id) => {
    const res = await apiFetch(`/students/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Workflow 4: Xác nhận thu học phí → tự động tạo hóa đơn
  pay: async (id, paymentMethod = 'transfer', note = '') => {
    const res = await apiFetch(`/students/${id}/pay`, {
      method: 'PUT',
      body: JSON.stringify({ paymentMethod, note }),
    });
    return res.json();
  },

  // Workflow 2: Mở khóa phòng thi thủ công (Admin)
  unlockExam: async (id) => {
    const res = await apiFetch(`/students/${id}/unlock-exam`, { method: 'PUT' });
    return res.json();
  },

  // Workflow 2: Khóa phòng thi (vi phạm)
  lockExam: async (id, reason = '') => {
    const res = await apiFetch(`/students/${id}/lock-exam`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },

  // Gán giảng viên
  assignTeacher: async (studentId, teacherId) => {
    const res = await apiFetch(`/students/${studentId}/assign-teacher`, {
      method: 'PUT',
      body: JSON.stringify({ teacherId }),
    });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEACHERS API
// ═══════════════════════════════════════════════════════════════════════════════

export const teachersAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/teachers${q ? `?${q}` : ''}`);
    return res.json();
  },

  getStats: async () => {
    const res = await apiFetch('/teachers/stats/summary');
    return res.json();
  },

  getById: async (id) => {
    const res = await apiFetch(`/teachers/${id}`);
    return res.json();
  },

  // Admin tạo giảng viên mới trực tiếp
  create: async (teacher) => {
    const res = await apiFetch('/teachers', {
      method: 'POST',
      body: JSON.stringify(teacher),
    });
    return res.json();
  },

  getFinance: async (id) => {
    const res = await apiFetch(`/teachers/${id}/finance`);
    return res.json();
  },

  // Lấy số buổi còn nợ + thông tin ngân hàng (cho modal Step 1)
  getPendingSessions: async (id) => {
    const res = await apiFetch(`/teachers/${id}/finance/pending`);
    return res.json();
  },

  payAllFinance: async (id) => {
    const res = await apiFetch(`/teachers/${id}/finance/pay-all`, { method: 'PUT' });
    return res.json();
  },

  // Thanh toán linh hoạt: Admin tự nhập số buổi + số tiền (FIFO)
  payFlexible: async (id, sessionsCount, amount, note) => {
    const res = await apiFetch(`/teachers/${id}/finance/pay-flexible`, {
      method: 'PUT',
      body: JSON.stringify({ sessionsCount, amount, note }),
    });
    return res.json();
  },

  update: async (id, updates) => {
    const res = await apiFetch(`/teachers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  delete: async (id) => {
    const res = await apiFetch(`/teachers/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Workflow 1: Admin nhập điểm onboarding test
  submitScore: async (id, testScore, testNotes = '') => {
    const res = await apiFetch(`/teachers/${id}/score`, {
      method: 'PUT',
      body: JSON.stringify({ testScore, testNotes }),
    });
    return res.json();
  },

  // Workflow 1: Phê duyệt (chỉ khi score >= 80)
  approve: async (id) => {
    const res = await apiFetch(`/teachers/${id}/approve`, { method: 'PUT' });
    return res.json();
  },

  reject: async (id, reason) => {
    const res = await apiFetch(`/teachers/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },

  // Workflow 1: Giảng viên nộp file thực hành
  submitPractical: async (id, fileUrl) => {
    const res = await apiFetch(`/teachers/${id}/submit-practical`, {
      method: 'POST',
      body: JSON.stringify({ fileUrl }),
    });
    return res.json();
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// INVOICES API
// ═══════════════════════════════════════════════════════════════════════════════

export const invoicesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/invoices${q ? `?${q}` : ''}`);
    return res.json();
  },

  getStats: async () => {
    const res = await apiFetch('/invoices/stats');
    return res.json();
  },

  getById: async (id) => {
    const res = await apiFetch(`/invoices/${id}`);
    return res.json();
  },

  create: async (invoice) => {
    const res = await apiFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify(invoice),
    });
    return res.json();
  },

  delete: async (id) => {
    const res = await apiFetch(`/invoices/${id}`, { method: 'DELETE' });
    return res.json();
  },

  exportPdf: async (id) => {
    const res = await apiFetch(`/invoices/${id}/pdf`);
    return res.blob();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS API (Workflow 4 — Lương Giảng Viên)
// ═══════════════════════════════════════════════════════════════════════════════

export const transactionsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/transactions${q ? `?${q}` : ''}`);
    return res.json();
  },

  getStats: async () => {
    const res = await apiFetch('/transactions/stats');
    return res.json();
  },

  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/transactions/teacher/${teacherId}`);
    return res.json();
  },

  // Tính lương tự động theo buổi dạy
  calculate: async (teacherId, month) => {
    const res = await apiFetch('/transactions/calculate', {
      method: 'POST',
      body: JSON.stringify({ teacherId, month }),
    });
    return res.json();
  },

  // Admin tạo phiếu chi
  create: async (data) => {
    const res = await apiFetch('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Admin xác nhận đã trả lương
  confirm: async (id, confirmedBy = 'Admin') => {
    const res = await apiFetch(`/transactions/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify({ confirmedBy }),
    });
    return res.json();
  },

  cancel: async (id) => {
    const res = await apiFetch(`/transactions/${id}/cancel`, { method: 'PUT' });
    return res.json();
  },

  delete: async (id) => {
    const res = await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES API
// ═══════════════════════════════════════════════════════════════════════════════

export const messagesAPI = {
  getConversations: async (userId) => {
    const res = await apiFetch(`/messages/conversations/${userId}`);
    return res.json();
  },

  getMessages: async (conversationId) => {
    const res = await apiFetch(`/messages/${conversationId}`);
    return res.json();
  },

  syncByUser: async (userId) => {
    const res = await apiFetch(`/messages/sync/${userId}`);
    return res.json();
  },

  send: async (message) => {
    const res = await apiFetch('/messages', {
      method: 'POST',
      body: JSON.stringify(message),
    });
    return res.json();
  },

  markRead: async (conversationId, readerId) => {
    const res = await apiFetch(`/messages/read/${conversationId}`, {
      method: 'PUT',
      body: JSON.stringify({ readerId }),
    });
    return res.json();
  },

  toggleReaction: async (messageId, type) => {
    const res = await apiFetch(`/messages/${messageId}/reaction`, {
      method: 'PATCH',
      body: JSON.stringify({ type }),
    });
    return res.json();
  },

  recall: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/recall`, {
      method: 'PATCH',
    });
    return res.json();
  },

  softDelete: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/soft-delete`, {
      method: 'PATCH',
    });
    return res.json();
  },

  createGroup: async (name, participants) => {
    const res = await apiFetch('/messages/groups', {
      method: 'POST',
      body: JSON.stringify({ name, participants }),
    });
    return res.json();
  },

  getContacts: async () => {
    const res = await apiFetch('/messages/contacts');
    return res.json();
  },

  getHiddenConversations: async () => {
    const res = await apiFetch('/messages/hidden');
    return res.json();
  },

  hideConversation: async (conversationId) => {
    const res = await apiFetch(`/messages/hide/${conversationId}`, {
      method: 'POST',
    });
    return res.json();
  },
  
  getGroups: async (userId) => {
    const res = await apiFetch(`/messages/groups/user/${userId}`);
    return res.json();
  },

  deleteGroup: async (groupId) => {
    const res = await apiFetch(`/messages/groups/${groupId}`, {
      method: 'DELETE',
    });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULES API (Workflow 2 — Lịch học & Unlock Thi)
// ═══════════════════════════════════════════════════════════════════════════════

export const schedulesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules${q ? `?${q}` : ''}`);
    return res.json();
  },

  getStats: async () => {
    const res = await apiFetch('/schedules/stats');
    return res.json();
  },

  getByTeacher: async (teacherId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules/teacher/${teacherId}${q ? `?${q}` : ''}`);
    return res.json();
  },

  getByStudent: async (studentId) => {
    const res = await apiFetch(`/schedules/student/${studentId}`);
    return res.json();
  },

  create: async (schedule) => {
    const res = await apiFetch('/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    });
    return res.json();
  },

  // Cập nhật lịch (hoàn thành → tự động unlock thi nếu đủ buổi)
  update: async (id, updates) => {
    const res = await apiFetch(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  delete: async (id) => {
    const res = await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATIONS API (Workflow 5)
// ═══════════════════════════════════════════════════════════════════════════════

export const evaluationsAPI = {
  getAdminFeedbacks: async () => {
    const res = await apiFetch('/evaluations/admin');
    return res.json();
  },

  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/evaluations/teacher/${teacherId}`);
    return res.json();
  },

  submit: async (data) => {
    const res = await apiFetch('/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASSIGNMENTS API (Workflow 3)
// ═══════════════════════════════════════════════════════════════════════════════

export const assignmentsAPI = {
  getByCourse: async (courseId) => {
    const res = await apiFetch(`/assignments/course/${courseId}`);
    return res.json();
  },

  create: async (data) => {
    const res = await apiFetch('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  submit: async (assignmentId, data) => {
    const res = await apiFetch(`/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },

  grade: async (submissionId, grade, teacherFeedback) => {
    const res = await apiFetch(`/assignments/submissions/${submissionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify({ grade, teacherFeedback }),
    });
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// EXAM RESULTS API — Kết quả thi HV & GV
// ═══════════════════════════════════════════════════════════════════════════════

export const examResultsAPI = {
  getAll: async (type = '') => {
    const q = type ? `?type=${type}` : '';
    const res = await apiFetch(`/exam-results${q}`);
    const data = await res.json();
    return data.data || [];
  },
  create: async (payload) => {
    const res = await apiFetch('/exam-results', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.data;
  },
  update: async (id, payload) => {
    const res = await apiFetch(`/exam-results/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.data;
  },
  remove: async (id) => {
    await apiFetch(`/exam-results/${id}`, { method: 'DELETE' });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

export const checkAPIHealth = async () => {
  try {
    const res  = await fetch(`${API_BASE.replace('/api', '')}/`);
    const data = await res.json();
    return { online: true, ...data };
  } catch {
    return { online: false };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const systemLogsAPI = {
  getAll: async (page = 1, limit = 50) => {
    const res = await apiFetch(`/system-logs?page=${page}&limit=${limit}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data;
  }
};

export const trainingAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/training${q ? `?${q}` : ''}`);
    return res.json();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS API
// ═══════════════════════════════════════════════════════════════════════════════
export const settingsAPI = {
  getAll: async () => {
    const res = await apiFetch('/settings');
    return res.json();
  },
  update: async (data) => {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  uploadPopupImage: async (file) => {
    const token = (() => {
      try {
        const keys = ['admin_user','teacher_user','student_user'];
        for (const k of keys) {
          const d = JSON.parse(localStorage.getItem(k) || 'null');
          if (d?.token) return d.token;
        }
      } catch {}
      return null;
    })();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/settings/upload-popup-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return res.json();
  },
  getPopup: async () => {
    const res = await apiFetch('/settings/popup');
    return res.json();
  },
  getPayment: async () => {
    const res = await apiFetch('/settings/payment');
    return res.json();
  },
};

export default {
  auth:         authAPI,
  students:     studentsAPI,
  teachers:     teachersAPI,
  invoices:     invoicesAPI,
  transactions: transactionsAPI,
  messages:     messagesAPI,
  schedules:    schedulesAPI,
  evaluations:  evaluationsAPI,
  assignments:  assignmentsAPI,
  examResults:  examResultsAPI,
  systemLogs:   systemLogsAPI,
  training:     trainingAPI,
  settings:     settingsAPI,
  checkHealth:  checkAPIHealth,
};
