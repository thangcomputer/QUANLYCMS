/**
 * Danh bạ chat nổi theo vai trò:
 * - SUPER / HIGH: mọi người đang online (presence directory)
 * - Student / Teacher / Staff / Support: chỉ peer từ GET /contacts (Phase 6/7)
 */
import { normalizeChatRole } from './chatConversationId';

/**
 * Elevated admins who may browse online presence as a directory.
 * STAFF/SUPPORT must NOT inherit this — they use server contacts.
 */
export function isElevatedPresenceDirectoryViewer(session) {
  if (!session) return false;
  const id = String(session?.id || session?._id || '');
  if (id === 'admin') return true;
  const ar = String(session?.adminRole || '').toUpperCase();
  return ar === 'SUPER_ADMIN' || ar === 'HIGH_ADMIN';
}

/**
 * @deprecated Prefer isElevatedPresenceDirectoryViewer for messaging directory mode.
 * Kept for FeedBoard UI (hide student quick-support for staff/admin accounts).
 */
export function isSuperAdminViewer(session) {
  if (!session) return false;
  const id = String(session?.id || session?._id || '');
  if (id === 'admin' || session?.adminRole === 'SUPER_ADMIN' || session?.adminRole === 'HIGH_ADMIN' || session?.adminRole === 'SUPPORT' || session?.role === 'admin' || session?.role === 'staff' || session?.adminRole === 'STAFF') {
    return true;
  }
  const perms = Array.isArray(session?.permissions) ? session.permissions : [];
  if (perms.includes('manage_messages')) return true;
  return false;
}

export function isSuperAdminPresence(u) {
  return String(u?.userId || '') === 'admin';
}

const ROLE_RANK = { admin: 0, staff: 0, teacher: 1, student: 2 };

/** Online trước → offline sau → tên A–Z (kiểu Facebook). */
export function compareByOnlineThenName(a, b) {
  const aOn = a?.online ? 1 : 0;
  const bOn = b?.online ? 1 : 0;
  if (aOn !== bOn) return bOn - aOn;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi');
}

function personFromPresence(u) {
  const rawRole = String(u.role || 'student').toLowerCase();
  const roleKey = normalizeChatRole(rawRole);
  const uid = String(u.userId || '');
  let labelRole = roleKey;
  if (rawRole === 'staff') labelRole = 'staff';
  return {
    id: uid,
    name: u.name || (rawRole === 'staff' ? 'Hỗ trợ viên' : roleKey === 'admin' ? 'Quản trị viên' : roleKey === 'teacher' ? 'Giảng viên' : 'Học viên'),
    role: rawRole === 'staff' ? 'staff' : roleKey,
    adminRole: u.adminRole || (rawRole === 'staff' ? 'STAFF' : null),
    displayRole: labelRole,
    avatar: u.avatar || '',
    online: true,
    branchId: u.branchId || null,
  };
}

function personFromAuthorizedContact(st, online) {
  const rawRole = String(st.role || '').toLowerCase();
  const ar = String(st.adminRole || st.productRole || '').toUpperCase();
  const roleKey = normalizeChatRole(rawRole === 'staff' ? 'staff' : rawRole);
  let displayRole = roleKey;
  if (rawRole === 'staff' || ar === 'STAFF' || ar === 'SUPPORT') displayRole = 'staff';
  else if (ar === 'SUPER_ADMIN' || ar === 'HIGH_ADMIN' || rawRole === 'admin') displayRole = 'admin';
  return {
    id: String(st.id || st._id || ''),
    name: st.name || (displayRole === 'admin' ? 'Quản trị viên' : displayRole === 'staff' ? 'Hỗ trợ viên' : displayRole === 'teacher' ? 'Giảng viên' : 'Học viên'),
    role: rawRole === 'staff' ? 'staff' : roleKey,
    adminRole: st.adminRole || (ar === 'SUPER_ADMIN' || ar === 'HIGH_ADMIN' ? ar : null),
    productRole: st.productRole || null,
    displayRole,
    avatar: st.avatar || '',
    online: Boolean(online),
    branchId: st.branchId || null,
  };
}

/**
 * @param {{ supportAgentsOnly?: boolean }} opts — true = chỉ SUPPORT org-wide (bỏ STAFF chi nhánh)
 * @returns {{ mode: 'directory'|'support_only', groups: Array<{ key: string, label: string, people: object[] }> }}
 */
export function buildSupportDirectory({ session, onlineUsers, meId, staffs = [], supportAgentsOnly = false }) {
  const me = String(meId || session?.id || session?._id || '');
  const users = Array.isArray(onlineUsers) ? onlineUsers : [];

  // Phase 7: only SUPER/HIGH use presence directory. Everyone else = server contacts.
  if (!isElevatedPresenceDirectoryViewer(session)) {
    // Phase 6: directory people come ONLY from server contacts (staffs arg).
    // Presence may mark online — must NOT invent unauthorized peers.
    const onlineIds = new Set();
    users.forEach((u) => {
      // Contacts remain the authorization source; presence only supplies online state.
      // Transport maps SUPPORT to "staff", so filtering presence by role would hide
      // an authorized support contact even while their socket is connected.
      const uid = String(u.userId || u.id || '');
      if (uid) onlineIds.add(uid);
    });

    const peopleList = [];
    const seenIds = new Set();
    if (Array.isArray(staffs)) {
      staffs.forEach((st) => {
        if (!st || st.status === 'Deleted' || st.status === 'inactive' || st.isDeleted) return;
        const r = String(st.role || '').toLowerCase();
        const ar = String(st.adminRole || '').toUpperCase();
        // Presentation filter on already-authorized contacts (from /contacts).
        // Prefer productRole when present — never map transport staff → product STAFF.
        const product = String(st.productRole || '').toUpperCase();
        const isSupportAgent = product === 'SUPPORT' || ar === 'SUPPORT' || r === 'support';
        const isOps = supportAgentsOnly
          ? isSupportAgent
          : (product === 'SUPPORT' || product === 'STAFF'
            || r === 'staff' || ar === 'STAFF' || ar === 'SUPPORT'
            || st.permissions?.includes?.('manage_messages'));
        if (!isOps) return;
        const stId = String(st.id || st._id || '');
        if (stId && stId !== me && !seenIds.has(stId)) {
          seenIds.add(stId);
          const adminRole = st.adminRole
            || (product === 'SUPPORT' ? 'SUPPORT' : product === 'STAFF' ? 'STAFF' : 'STAFF');
          peopleList.push({
            id: stId,
            name: st.name || 'Hỗ trợ viên',
            role: 'staff',
            displayRole: 'staff',
            adminRole,
            productRole: st.productRole || (adminRole === 'SUPPORT' ? 'SUPPORT' : 'STAFF'),
            gender: st.gender || '',
            permissions: st.permissions || ['manage_messages'],
            avatar: st.avatar || '',
            online: onlineIds.has(stId),
          });
        }
      });
    }

    return {
      mode: 'support_only',
      groups: [{
        key: 'support',
        label: supportAgentsOnly ? 'Chuyên viên hỗ trợ' : 'Hỗ trợ viên',
        people: peopleList.sort(compareByOnlineThenName),
      }],
    };
  }

  // Elevated: contacts = WHO (authorization); presence = online overlay only.
  // Do not invent peers from presence outside the authorized contact set.
  const presenceById = new Map();
  for (const u of users) {
    const uid = String(u.userId || u.id || '');
    if (uid) presenceById.set(uid, u);
  }

  const authorized = Array.isArray(staffs) ? staffs : [];
  const seen = new Set();
  const buckets = {
    admin: [],
    teacher: [],
    student: [],
  };

  for (const st of authorized) {
    if (!st || st.status === 'Deleted' || st.status === 'inactive' || st.isDeleted) continue;
    const uid = String(st.id || st._id || '');
    if (!uid || uid === me) continue;
    if (uid === 'admin' && me === 'admin') continue;
    if (seen.has(uid)) continue;
    seen.add(uid);

    const online = presenceById.has(uid);
    const person = personFromAuthorizedContact(st, online);
    if (online) {
      const u = presenceById.get(uid);
      if (u?.name) person.name = u.name;
      if (u?.avatar) person.avatar = u.avatar;
    }

    const display = String(person.displayRole || person.role || '').toLowerCase();
    if (display === 'teacher') buckets.teacher.push(person);
    else if (display === 'student') buckets.student.push(person);
    else buckets.admin.push(person);
  }

  const sortPeople = (arr) => arr.sort((a, b) => {
    const onlineCmp = compareByOnlineThenName(a, b);
    if (onlineCmp !== 0) return onlineCmp;
    const d = (ROLE_RANK[a.displayRole] ?? 9) - (ROLE_RANK[b.displayRole] ?? 9);
    if (d !== 0) return d;
    return 0;
  });

  const groups = [];
  if (buckets.admin.length) {
    groups.push({
      key: 'admin',
      label: `Hỗ trợ viên & Quản trị (${buckets.admin.length})`,
      people: sortPeople(buckets.admin),
    });
  }
  if (buckets.teacher.length) {
    groups.push({
      key: 'teacher',
      label: `Giảng viên (${buckets.teacher.length})`,
      people: sortPeople(buckets.teacher),
    });
  }
  if (buckets.student.length) {
    groups.push({
      key: 'student',
      label: `Học viên (${buckets.student.length})`,
      people: sortPeople(buckets.student),
    });
  }

  return { mode: 'directory', groups };
}

/** Flatten people for simple lists (FeedBoard) */
export function flattenSupportPeople(directory) {
  return (directory?.groups || []).flatMap((g) => g.people || []);
}
