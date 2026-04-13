// ─── API Service - Hệ thống CMS Thắng Tin Học ───────────────────────────────

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api';
export const SOCKET_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000');

/**
 * Xác định Role dựa trên dữ liệu đang có trong LocalStorage hoặc URL.
 */
export const getRolePrefix = (overrideRole = null) => {
  if (overrideRole) return overrideRole;
  if (typeof window === 'undefined') return 'thvp';
  
  const path = window.location.pathname;

  // 1. Kiểm tra Token của từng vai trò (Dấu hiệu mạnh nhất)
  const roles = ['admin', 'staff', 'teacher', 'student'];
  for (const r of roles) {
    if (localStorage.getItem(`${r}_access_token`)) return r;
    
    // Kiểm tra legacy user object
    const uStr = localStorage.getItem(`${r}_user`);
    if (uStr) {
      try {
        const u = JSON.parse(uStr);
        if (u.token || u.accessToken) return r;
      } catch(e) {}
    }
  }

  // 2. Fallback dựa trên URL
  if (path.startsWith('/admin'))   return 'admin';
  if (path.startsWith('/teacher')) return 'teacher';
  if (path.startsWith('/student')) return 'student';

  return 'thvp';
};

/**
 * Lấy Access Token từ LocalStorage.
 */
export const getAccessToken = (role = null) => {
  const prefix = getRolePrefix(role);
  const directToken = localStorage.getItem(`${prefix}_access_token`);
  if (directToken) return directToken;

  // Fallback: đọc từ object session user
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    return session?.token || session?.accessToken || null;
  } catch {
    return null;
  }
};

/**
 * Lưu trữ Token một cách tường minh vào LocalStorage.
 */
export const setTokens = (access, refresh, role) => {
  if (!role) return;
  const prefix = role.toLowerCase();
  
  if (access)  localStorage.setItem(`${prefix}_access_token`, access);
  else         localStorage.removeItem(`${prefix}_access_token`);
  
  if (refresh) localStorage.setItem(`${prefix}_refresh_token`, refresh);
  else         localStorage.removeItem(`${prefix}_refresh_token`);
};

/**
 * Xóa sạch thông tin phiên đăng nhập của Role.
 */
export const clearTokens = (role) => {
  if (!role) return;
  const prefix = role.toLowerCase();
  localStorage.removeItem(`${prefix}_access_token`);
  localStorage.removeItem(`${prefix}_refresh_token`);
  localStorage.removeItem(`${prefix}_user`);
};

/**
 * Lấy thông tin Refresh Token.
 */
export const getRefreshToken = (role = null) => {
  const prefix = getRolePrefix(role);
  const directToken = localStorage.getItem(`${prefix}_refresh_token`);
  if (directToken) return directToken;
  
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    return session?.refreshToken || null;
  } catch {
    return null;
  }
};

/**
 * CORE FETCH HELPER: Tự động đính kèm Auth Header và xử lý lỗi hệ thống.
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url     = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  const activeToken = getAccessToken();
  if (activeToken && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });

    // Xử lý khi Token hết hạn (401)
    if (res.status === 401 && !options.skipAuth) {
      const cloned = res.clone();
      try {
        const errBody = await cloned.json();
        if (errBody.code === 'TOKEN_VERSION_MISMATCH' || errBody.code === 'UNAUTHORIZED') {
          const prefix = getRolePrefix();
          clearTokens(prefix);
          // Redirect về trang login tương ứng
          window.location.href = prefix === 'admin' || prefix === 'staff' ? '/admin/login' : '/login';
        }
      } catch (e) {
        // Fallback: Nếu 401 mà không có body JSON, cũng coi như phiên hết hạn
        const prefix = getRolePrefix();
        clearTokens(prefix);
        window.location.href = prefix === 'admin' || prefix === 'staff' ? '/admin/login' : '/login';
      }
    }

    return res;
  } catch (err) {
    console.error('FETCH_EXCEPTION:', err);
    throw err;
  }
};

// ─── AUTH API ───────────────────────────────────────────────────────────────
export const authAPI = {
  login: async (identifier, password) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
      skipAuth: true
    });
    return res.json();
  },
  
  me: async () => {
    const res = await apiFetch('/auth/me');
    return res.json();
  },

  logout: async () => {
    const role = getRolePrefix();
    const res = await apiFetch('/auth/logout', { method: 'POST' });
    clearTokens(role);
    return res;
  }
};

// ─── STUDENT API ────────────────────────────────────────────────────────────
export const studentsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students${q ? `?${q}` : ''}`);
    return res.json();
  },
  getById: async (id) => {
    const res = await apiFetch(`/students/${id}`);
    return res.json();
  },
  getFullDetail: async (id) => {
    const res = await apiFetch(`/students/${id}/full-detail`);
    return res.json();
  },
  create: async (student) => {
    const res = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify(student),
    });
    return res.json();
  },
  importBulk: async (students) => {
    const res = await apiFetch('/students/import', {
      method: 'POST',
      body: JSON.stringify({ students }),
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
  remove: async (id) => {
    const res = await apiFetch(`/students/${id}`, { method: 'DELETE' });
    return res.json();
  },
  payTeacher: async (studentId, action) => {
    const res = await apiFetch(`/students/${studentId}/pay-teacher`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students/stats${q ? `?${q}` : ''}`);
    return res.json();
  },
  resetTodayAttendance: async (id) => {
    const res = await apiFetch(`/students/${id}/reset-today-attendance`, { method: 'POST' });
    return res.json();
  },
};

// ─── TEACHER API ────────────────────────────────────────────────────────────
export const teachersAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/teachers${q ? `?${q}` : ''}`);
    return res.json();
  },
  getById: async (id) => {
    const res = await apiFetch(`/teachers/${id}`);
    return res.json();
  },
  create: async (teacher) => {
    const res = await apiFetch('/teachers', {
      method: 'POST',
      body: JSON.stringify(teacher),
    });
    return res.json();
  },
  getPendingSessions: async (id) => {
    const res = await apiFetch(`/teachers/${id}/finance/pending`);
    return res.json();
  },
  payFlexible: async (teacherId, sessionsCount, amount, note) => {
    const res = await apiFetch(`/teachers/${teacherId}/finance/pay-flexible`, {
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
  remove: async (id) => {
    const res = await apiFetch(`/teachers/${id}`, { method: 'DELETE' });
    return res.json();
  },
  getFinance: async (teacherId) => {
    const res = await apiFetch(`/teachers/${teacherId}/finance`);
    return res.json();
  },
  uploadPractical: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // Since apiFetch might automatically set headers['Content-Type'] to 'application/json' if not using FormData, 
    // we need to be careful. Wait, apiFetch logic in api.js handles FormData by removing Content-Type.
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('teacher_access_token') || localStorage.getItem('admin_access_token');
    const res = await fetch(`${API}/teachers/upload-practical`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },
};

// ─── FINANCE / INVOICES API ─────────────────────────────────────────────────
export const invoicesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/invoices${q ? `?${q}` : ''}`);
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/invoices/stats${q ? `?${q}` : ''}`);
    return res.json();
  },
};

export const transactionsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/transactions${q ? `?${q}` : ''}`);
    return res.json();
  },
  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/transactions/teacher/${teacherId}`);
    return res.json();
  },
};

// ─── MESSAGE API ────────────────────────────────────────────────────────────
export const messagesAPI = {
  getContacts: async () => {
    const res = await apiFetch('/messages/contacts');
    return res.json();
  },
  getHiddenConversations: async () => {
    const res = await apiFetch('/messages/hidden');
    return res.json();
  },
  hideConversation: async (conversationId) => {
    const res = await apiFetch(`/messages/hide/${conversationId}`, { method: 'POST' });
    return res.json();
  },
  getGroups: async (userId) => {
    // Nếu có userId thì gọi route đúng, nếu không thì fallback về /groups
    const url = userId ? `/messages/groups/user/${userId}` : '/messages/groups';
    const res = await apiFetch(url);
    return res.json();
  },
  getHistory: async (groupId) => {
    const res = await apiFetch(`/messages/history/${groupId}`);
    return res.json();
  },
  send: async (data) => {
    const res = await apiFetch('/messages', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  uploadMessageFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('access_token');
    // Using native fetch because apiFetch by default sets Content-Type to application/json
    const res = await fetch('/api/messages/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },
  syncByUser: async (userId) => {
    const res = await apiFetch(`/messages/sync/${userId}`);
    return res.json();
  },
  toggleReaction: async (messageId, type) => {
    const res = await apiFetch(`/messages/${messageId}/reaction`, {
      method: 'PATCH',
      body: JSON.stringify({ type })
    });
    return res.json();
  },
  recall: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/recall`, { method: 'PATCH' });
    return res.json();
  },
  softDelete: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/soft-delete`, { method: 'PATCH' });
    return res.json();
  },
  getGroups: async (userId) => {
    const res = await apiFetch(`/messages/groups/user/${userId}`);
    return res.json();
  },
  createGroup: async (name, participants) => {
    const res = await apiFetch('/messages/groups', {
      method: 'POST',
      body: JSON.stringify({ name, participants })
    });
    return res.json();
  },
  deleteGroup: async (groupId) => {
    const res = await apiFetch(`/messages/groups/${groupId}`, { method: 'DELETE' });
    return res.json();
  },
  markRead: async (conversationId) => {
    const res = await apiFetch(`/messages/read/${conversationId}`, { method: 'PUT' });
    return res.json();
  }
};

// ─── SCHEDULE API ───────────────────────────────────────────────────────────
export const schedulesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules${q ? `?${q}` : ''}`);
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules/stats${q ? `?${q}` : ''}`);
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
  create: async (data) => {
    const res = await apiFetch('/schedules', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  update: async (id, data) => {
    const res = await apiFetch(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    return res.json();
  }
};

// ─── EVALUATION API ─────────────────────────────────────────────────────────
export const evaluationsAPI = {
  getPrivate: async () => {
    const res = await apiFetch('/evaluations/admin');
    return res.json();
  },
  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/evaluations/teacher/${encodeURIComponent(teacherId)}`);
    return res.json();
  },
  submit: async (data) => {
    const res = await apiFetch('/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  markRead: async (id) => {
    const res = await apiFetch(`/evaluations/${id}/read`, { method: 'POST' });
    return res.json();
  },
};

// ─── ASSIGNMENT API ─────────────────────────────────────────────────────────
export const assignmentsAPI = {
  getByCourse: async (courseId) => {
    const res = await apiFetch(`/assignments/course/${encodeURIComponent(courseId)}`);
    return res.json();
  },
  getByStudentAndCourse: async (studentId, courseId) => {
    const res = await apiFetch(`/assignments/student/${encodeURIComponent(studentId)}/course/${encodeURIComponent(courseId)}`);
    return res.json();
  },
  create: async (data) => {
    const res = await apiFetch(`/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (assignmentId, data) => {
    const res = await apiFetch(`/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (assignmentId) => {
    const res = await apiFetch(`/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const options = { method: 'POST', body: formData };
    // Khong send Content-Type ngam dinh de fetch auto sinh multipart content-type boundary
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:5000/api/assignments/upload`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
  grade: async (submissionId, data) => {
    const res = await apiFetch(`/assignments/submissions/${submissionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// ─── EXAM RESULTS API ───────────────────────────────────────────────────────
export const examResultsAPI = {
  getAll: async (type = '') => {
    const q = type ? `?type=${type}` : '';
    const res = await apiFetch(`/exam-results${q}`);
    const data = await res.json();
    return data.data || [];
  },
};

// ─── SETTINGS API ───────────────────────────────────────────────────────────
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
  resetData: async (data) => {
    const res = await apiFetch('/settings/reset-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  uploadLogo: async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    const res = await fetch(`${API_BASE}/settings/upload-logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: fd,
    });
    return res.json();
  },
  uploadPopupImage: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`${API_BASE}/settings/upload-popup-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: fd,
    });
    return res.json();
  },
  getPopup: async () => {
    const res = await apiFetch('/settings/popup');
    return res.json();
  },
  getTrainingData: async () => {
    const res = await apiFetch('/settings/training-data');
    return res.json();
  },
  updateTrainingData: async (trainingData) => {
    const res = await apiFetch('/settings/training-data', {
      method: 'PUT',
      body: JSON.stringify({ trainingData }),
    });
    return res.json();
  },
};


// ─── SYSTEM LOGS API ────────────────────────────────────────────────────────
export const systemLogsAPI = {
  getAll: async (page = 1, limit = 50) => {
    const res = await apiFetch(`/system-logs?page=${page}&limit=${limit}`);
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
  settings:     settingsAPI,
  systemLogs:   systemLogsAPI,
};
