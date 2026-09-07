/** Catalog mon thi (mac dinh + tuy chinh tu server) */
export const BUILTIN_EXAM_SUBJECTS = {
  coban: { id: 'coban', label: 'M\u00E1y vi t\u00EDnh (C\u01A1 b\u1EA3n)', short: 'C', bg: 'bg-slate-600', minutes: 90, group: 'office' },
  word: { id: 'word', label: 'Word', short: 'W', bg: 'bg-blue-600', minutes: 90, group: 'office' },
  excel: { id: 'excel', label: 'Excel', short: 'X', bg: 'bg-green-600', minutes: 90, group: 'office' },
  powerpoint: { id: 'powerpoint', label: 'PowerPoint', short: 'P', bg: 'bg-orange-500', minutes: 90, group: 'office' },
  photoshop: { id: 'photoshop', label: 'Photoshop', short: 'PS', bg: 'bg-sky-600', minutes: 90, group: 'design' },
  canva: { id: 'canva', label: 'Canva', short: 'CA', bg: 'bg-purple-600', minutes: 90, group: 'design' },
  corel: { id: 'corel', label: 'Corel', short: 'CR', bg: 'bg-pink-600', minutes: 90, group: 'design' },
  autocad: { id: 'autocad', label: 'AutoCAD', short: 'AU', bg: 'bg-amber-600', minutes: 90, group: 'design' },
  'mos-word': { id: 'mos-word', label: 'MOS-Word', short: 'MW', bg: 'bg-indigo-600', minutes: 90, group: 'mos' },
  'mos-excel': { id: 'mos-excel', label: 'MOS-Excel', short: 'ME', bg: 'bg-emerald-700', minutes: 90, group: 'mos' },
  'mos-powerpoint': { id: 'mos-powerpoint', label: 'MOS-PowerPoint', short: 'MP', bg: 'bg-rose-600', minutes: 90, group: 'mos' },
  cpp: { id: 'cpp', label: 'C++', short: 'C+', bg: 'bg-cyan-700', minutes: 90, group: 'programming' },
  web: { id: 'web', label: 'Web', short: 'WB', bg: 'bg-teal-700', minutes: 90, group: 'programming' },
  python: { id: 'python', label: 'Python', short: 'PY', bg: 'bg-yellow-600', minutes: 90, group: 'programming' },
  situation: { id: 'situation', label: 'S\u01B0 ph\u1EA1m (T\u00ECnh hu\u1ED1ng)', short: 'SP', bg: 'bg-rose-600', minutes: 90, group: 'pedagogy' },
};
export const EXAM_SUBJECTS = BUILTIN_EXAM_SUBJECTS;
export const OFFICE_EXAM_IDS = ['coban', 'word', 'excel', 'powerpoint'];
export const MOS_EXAM_IDS = ['mos-word', 'mos-excel', 'mos-powerpoint'];
export const DESIGN_EXAM_IDS = ['photoshop', 'canva', 'corel', 'autocad'];
export const PROGRAMMING_EXAM_IDS = ['cpp', 'web', 'python'];
export const EXAM_SUBJECT_GROUP_LABELS = {
  office: 'Tin học văn phòng',
  design: 'Design',
  mos: 'Tin học MOS',
  programming: 'Lập trình',
  pedagogy: 'Sư phạm',
  admin: 'Admin tạo',
};

export function slugifyExamSubjectId(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

export function getExamSubjectInitials(meta) {
  const short = String(meta?.short || '').trim();
  if (short && short.length <= 3 && !/\s/.test(short)) return short.toUpperCase();
  const label = String(meta?.label || '').trim();
  if (label) {
    const words = label.split(/[\s()\-–—/&,+]+/).filter((w) => /[a-zA-Z0-9]/.test(w));
    if (words.length >= 2) {
      return words.slice(0, 2).map((w) => (w.match(/[a-zA-Z0-9]/) || [''])[0]).join('').toUpperCase().slice(0, 3);
    }
    const alnum = label.replace(/[^a-zA-Z0-9]/g, '');
    if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
    if (alnum.length === 1) return alnum.toUpperCase();
  }
  return String(meta?.id || '?').slice(0, 2).toUpperCase();
}

export function mergeExamCatalog(customList) {
  const merged = { ...BUILTIN_EXAM_SUBJECTS };
  (Array.isArray(customList) ? customList : []).forEach((item) => {
    if (!item?.id || !item?.label) return;
    const entry = { id: item.id, label: item.label, bg: item.bg || 'bg-gray-600', minutes: item.minutes || 90, custom: true, group: item.group || 'admin' };
    merged[item.id] = { ...entry, short: getExamSubjectInitials({ ...entry, short: item.short }) };
  });
  return merged;
}

export function mergedArrayToCatalog(list) {
  const custom = (Array.isArray(list) ? list : []).filter((s) => s?.id && !BUILTIN_EXAM_SUBJECTS[s.id]);
  return mergeExamCatalog(custom);
}

export function getExamSubjectOptions(catalog) {
  const map = catalog || BUILTIN_EXAM_SUBJECTS;
  return Object.values(map).map(({ id, label, group }) => ({ id, label, group: group || 'admin' }));
}

export function getExamSubjectGroupLabel(group, overrides = null) {
  const key = String(group || '');
  if (overrides && typeof overrides === 'object' && overrides[key]) {
    const custom = String(overrides[key]).trim();
    if (custom) return custom;
  }
  return EXAM_SUBJECT_GROUP_LABELS[key] || 'Khác';
}

export function normalizeCourseKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd');
}

export function mapCourseToExamSubjectIds(courseName, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const n = normalizeCourseKey(courseName);
  const pick = (ids) => ids.filter((id) => cat[id]);
  if (!n) return [];
  if (n.includes('mos')) return pick([...MOS_EXAM_IDS]);
  if (n.includes('photoshop')) return pick(['photoshop']);
  if (n.includes('corel')) return pick(['corel']);
  if (n.includes('autocad')) return pick(['autocad']);
  if (n.includes('python')) return pick(['python']);
  if (n.includes('c++') || n.includes('cpp')) return pick(['cpp']);
  if (n.includes('web')) return pick(['web']);
  // Combo Powerpoint + Canva trong cùng tên khóa
  if (n.includes('canva') && (n.includes('powerpoint') || n.includes('ppt'))) {
    return pick(['coban', 'powerpoint', 'canva']);
  }
  if (n.includes('canva')) return pick(['canva']);
  if (n.includes('thiet ke') || n.includes('do hoa') || n.includes('design')) return pick([...DESIGN_EXAM_IDS]);
  if (n.includes('lap trinh') || n.includes('programming')) return pick([...PROGRAMMING_EXAM_IDS]);
  if (n.includes('thvp') || n.includes('van phong') || n.includes('tin hoc van phong') || n.includes('microsoft office')) return pick([...OFFICE_EXAM_IDS]);
  if (n.includes('excel') && !n.includes('van phong')) return pick(['coban', 'excel']);
  if (n.includes('word') && !n.includes('van phong')) return pick(['coban', 'word']);
  if (n.includes('powerpoint') || n.includes('ppt')) return pick(['coban', 'powerpoint']);
  // Đồ họa — không mặc định sang tin học văn phòng
  if (n.includes('photoshop') || n.includes('illustrator') || n.includes('do hoa') || n.includes('thiet ke')) {
    for (const sub of Object.values(cat)) {
      const ln = normalizeCourseKey(sub.label || '');
      const idn = normalizeCourseKey(sub.id || '');
      if (n.includes(idn) || n.includes(ln) || ln.includes(n) || idn.includes('photoshop')) return [sub.id];
    }
    return [];
  }
  for (const sub of Object.values(cat)) {
    if (n.includes(sub.id) || n.includes(normalizeCourseKey(sub.label))) return [sub.id];
  }
  return [];
}

/**
 * Map khóa → subjectIds nhưng KHÔNG fallback sang Office khi không nhận ra tên khóa.
 * Dùng khi lọc giảng viên phù hợp môn.
 */
export function mapCourseToExamSubjectIdsStrict(courseName, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const n = normalizeCourseKey(courseName);
  if (!n) return [];
  const loose = mapCourseToExamSubjectIds(courseName, cat);
  const looksOffice =
    n.includes('thvp')
    || n.includes('van phong')
    || n.includes('tin hoc van phong')
    || n.includes('microsoft office')
    || n.includes('excel')
    || n.includes('word')
    || n.includes('powerpoint')
    || n.includes('ppt')
    || n.includes('coban')
    || n.includes('may vi tinh')
    || n.includes('co ban')
    || n.includes('canva');
  const looksExtended =
    n.includes('mos')
    || n.includes('photoshop')
    || n.includes('corel')
    || n.includes('autocad')
    || n.includes('python')
    || n.includes('c++')
    || n.includes('cpp')
    || n.includes('web')
    || n.includes('lap trinh')
    || n.includes('thiet ke')
    || n.includes('do hoa')
    || n.includes('design');
  const allOffice = loose.length > 0 && loose.every((id) => OFFICE_EXAM_IDS.includes(id));
  if (allOffice && !looksOffice && !looksExtended) return [];
  return loose;
}

/** Khớp mờ tên khóa ↔ specialty / label môn của GV (chỉ khi chưa có focus rõ) */
function fuzzyCourseTeacherMatch(courseName, teacher, catalog) {
  const courseKey = normalizeCourseKey(courseName);
  if (!courseKey) return false;
  const specialtyKey = normalizeCourseKey(teacher?.specialty || '');
  if (specialtyKey) {
    if (specialtyKey.includes(courseKey) || courseKey.includes(specialtyKey)) return true;
    for (const part of specialtyKey.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean)) {
      if (part.length >= 3 && (courseKey.includes(part) || part.includes(courseKey))) return true;
    }
  }
  return false;
}

/**
 * Focus giảng dạy của khóa — không gộp THVP thành mọi môn Office.
 * Excel-only ≠ THVP; THVP teacher không match Excel-only và ngược lại.
 */
export function getCourseTeachingFocus(courseOrEnrollment, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const courseName = typeof courseOrEnrollment === 'string'
    ? courseOrEnrollment
    : (courseOrEnrollment?.courseName || courseOrEnrollment?.name || '');
  const enrollmentSubjects = Array.isArray(courseOrEnrollment?.examSubjects)
    ? courseOrEnrollment.examSubjects.filter(Boolean)
    : [];
  const n = normalizeCourseKey(courseName);

  if (n.includes('thvp') || n.includes('van phong') || n.includes('tin hoc van phong') || n.includes('microsoft office')) {
    return ['thvp'];
  }
  if (n.includes('canva') && (n.includes('powerpoint') || n.includes('ppt'))) return ['powerpoint', 'canva'];
  if (n.includes('canva')) return ['canva'];
  if (n.includes('photoshop')) return ['photoshop'];
  if (n.includes('corel')) return ['corel'];
  if (n.includes('autocad')) return ['autocad'];
  if (n.includes('mos')) return [...MOS_EXAM_IDS];
  if (n.includes('python')) return ['python'];
  if (n.includes('c++') || n.includes('cpp')) return ['cpp'];
  if (n.includes('web')) return ['web'];
  if (n.includes('excel')) return ['excel'];
  if (n.includes('word')) return ['word'];
  if (n.includes('powerpoint') || n.includes('ppt')) return ['powerpoint'];
  if (n.includes('coban') || n.includes('may vi tinh') || n.includes('co ban')) return ['coban'];

  if (enrollmentSubjects.length) {
    const officeHits = enrollmentSubjects.filter((id) => OFFICE_EXAM_IDS.includes(String(id)));
    const nonCobanOffice = officeHits.filter((id) => id !== 'coban');
    if (nonCobanOffice.length >= 3) return ['thvp'];
    const focuses = [];
    enrollmentSubjects.forEach((id) => {
      const sid = String(id);
      if (sid === 'coban') return;
      if (OFFICE_EXAM_IDS.includes(sid) || cat[sid] || sid === 'canva') focuses.push(sid);
    });
    if (focuses.length) return [...new Set(focuses)];
  }

  return mapCourseToExamSubjectIdsStrict(courseName, cat).filter((id) => id !== 'coban');
}

/** Focus chuyên môn GV từ specialty / subjectIds */
export function getTeacherTeachingFocus(teacher, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const specialtyKey = normalizeCourseKey(teacher?.specialty || '');
  if (
    specialtyKey.includes('thvp')
    || specialtyKey.includes('van phong')
    || specialtyKey.includes('tin hoc van phong')
    || specialtyKey.includes('microsoft office')
  ) {
    return ['thvp'];
  }

  const focuses = new Set();
  if (specialtyKey.includes('excel')) focuses.add('excel');
  if (specialtyKey.includes('word')) focuses.add('word');
  if (specialtyKey.includes('powerpoint') || specialtyKey.includes('ppt')) focuses.add('powerpoint');
  if (specialtyKey.includes('canva')) focuses.add('canva');
  if (specialtyKey.includes('coban') || specialtyKey.includes('may vi tinh') || specialtyKey.includes('co ban')) {
    focuses.add('coban');
  }

  const ids = resolveTeacherSubjectIds(teacher, cat).map(String);
  ids.forEach((id) => {
    if (id === 'coban') return;
    if (id === 'canva' || OFFICE_EXAM_IDS.includes(id) || cat[id]) focuses.add(id);
  });

  // Đủ Word + Excel + PowerPoint (specialty hoặc subjectIds) → focus THVP
  // để khớp khóa "Tin học văn phòng". Giữ môn ngoài Office (MOS, Design, Sư phạm…).
  // Canva (hoặc môn design khác) KHÔNG chặn quy đổi THVP — trước đây !hasCanva khiến
  // GV dạy Office+Canva bị coi "khác môn" với khóa THVP.
  const hasFullOffice = ['word', 'excel', 'powerpoint'].every((id) => focuses.has(id));
  if (hasFullOffice) {
    focuses.delete('word');
    focuses.delete('excel');
    focuses.delete('powerpoint');
    focuses.delete('coban');
    focuses.add('thvp');
  }

  return [...focuses];
}

/**
 * GV có thể dạy khóa này không?
 * Khớp theo focus chuyên môn (Excel / Word / THVP / Canva…), không dùng giao subjectIds
 * quá rộng khiến GV THVP bị coi là dạy được Excel-only.
 * Lệch môn → UI làm mờ và không cho chọn.
 */
export function teacherMatchesCourse(teacher, courseOrEnrollment, catalog) {
  if (!teacher) return false;
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const courseName = typeof courseOrEnrollment === 'string'
    ? courseOrEnrollment
    : (courseOrEnrollment?.courseName || courseOrEnrollment?.name || '');

  const courseFocus = getCourseTeachingFocus(courseOrEnrollment, cat);
  const teacherFocus = getTeacherTeachingFocus(teacher, cat);

  if (courseFocus.length && teacherFocus.length) {
    const set = new Set(teacherFocus.map(String));
    if (courseFocus.some((f) => set.has(String(f)))) return true;
    // THVP: GV đủ ≥2 môn Office (Word/Excel/PPT) vẫn gán được — tránh kẹt khi chưa khai báo đủ bộ
    if (courseFocus.map(String).includes('thvp')) {
      const officeHits = ['word', 'excel', 'powerpoint'].filter((id) => set.has(id));
      if (officeHits.length >= 2) return true;
    }
  }

  // Chưa khai báo môn → không khớp
  if (!teacherFocus.length && !String(teacher?.specialty || '').trim()) return false;

  return fuzzyCourseTeacherMatch(courseName, teacher, cat);
}

export function getSubjectIdsForEnrollment(enrollment, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  if (Array.isArray(enrollment?.examSubjects) && enrollment.examSubjects.length) {
    return enrollment.examSubjects.filter((id) => cat[id]);
  }
  return mapCourseToExamSubjectIds(enrollment?.courseName || enrollment?.name, cat);
}

/** Các enrollment gắn với một môn thi (theo examSubjects / tên khóa). */
export function findEnrollmentsForSubject(enrollments, subjectId, catalog) {
  const sid = String(subjectId || '');
  if (!sid) return [];
  return (enrollments || []).filter((e) =>
    getSubjectIdsForEnrollment(e, catalog).map(String).includes(sid)
  );
}

/** Mở khóa thi theo khóa: true nếu bất kỳ enrollment nào của môn đó đã mở. */
export function isExamUnlockedForSubject(enrollments, subjectId, catalog, fallbackUnlocked = false) {
  const list = findEnrollmentsForSubject(enrollments, subjectId, catalog);
  if (list.length) return list.some((e) => e.examUnlocked === true);
  return !!fallbackUnlocked;
}

/**
 * Yêu cầu webcam theo khóa: chỉ khi enrollment/root được admin bật tường minh (=== true).
 * Mặc định tắt — không bắt camera khi chưa cấu hình.
 */
export function requireWebcamForSubject(enrollments, subjectId, catalog, fallbackRequire = false) {
  const list = findEnrollmentsForSubject(enrollments, subjectId, catalog);
  if (list.length) return list.some((e) => e.requireWebcam === true);
  return fallbackRequire === true;
}

export function getSubjectIdsForStudent(enrollments, fallbackCourse, catalog) {
  const ids = new Set();
  if (Array.isArray(enrollments) && enrollments.length) {
    enrollments.forEach((e) => {
      if (e.cancelledAt || e.status === 'cancelled' || e.status === 'refunded') return; // Bỏ qua khóa học đã hủy
      getSubjectIdsForEnrollment(e, catalog).forEach((id) => ids.add(id));
    });
  } else if (fallbackCourse) {
    mapCourseToExamSubjectIds(fallbackCourse, catalog).forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function getSubjectIdsForCourseFilter(enrollments, filterCourse, fallbackCourse, catalog) {
  if (filterCourse === 'all') return getSubjectIdsForStudent(enrollments, fallbackCourse, catalog);
  const enr = enrollments.find((e) => (e.courseName || e.name) === filterCourse);
  if (enr) {
    if (enr.cancelledAt || enr.status === 'cancelled' || enr.status === 'refunded') return []; // Bỏ qua khóa học đã hủy
    return getSubjectIdsForEnrollment(enr, catalog);
  }
  return mapCourseToExamSubjectIds(filterCourse, catalog);
}

export function buildExamSubjectsFromProgress(examProgress, subjectIds) {
  const ids = subjectIds || [];
  return ids.map((id) => {
    const def = { id, status: 'chua_thi', tracNghiem: null, thucHanh: 'chua_nop', lockUntil: null };
    const saved = (examProgress || []).find((s) => s.id === id);
    return saved ? { ...def, ...saved } : def;
  });
}

/**
 * Môn bị khóa với HV: còn countdown, đã rớt (khong_dat), hoặc dang_khoa.
 * Thi lại chỉ khi admin reset status về chua_thi (và xóa lockUntil).
 */
export function isExamProgressLocked(entry, now = Date.now()) {
  if (!entry) return false;
  const lu = Number(entry.lockUntil);
  if (Number.isFinite(lu) && lu > now) return true;
  const st = String(entry.status || '');
  if (st === 'khong_dat' || st === 'dang_khoa') return true;
  return false;
}

/** HV được phép START/RESUME certification exam cho môn này. */
export function canEnterCertificationExam(entry, now = Date.now()) {
  if (isExamProgressLocked(entry, now)) return false;
  const st = String(entry?.status || '');
  return !st || st === 'chua_thi' || st === 'dang_thi';
}

export function examMilestone(subjectIds, subjectId, completedSessions, totalSessions) {
  const ids = (subjectIds || []).map(String);
  const idx = ids.findIndex((id) => id === String(subjectId));
  const count = Math.max(1, ids.length);
  const total = Math.max(1, Number(totalSessions) || 12);
  const interval = Math.max(1, Math.floor(total / count));
  const requiredSessions = idx < 0 ? interval : interval * (idx + 1);
  const done = Number(completedSessions) || 0;
  return { requiredSessions, meetsMilestone: idx >= 0 && done >= requiredSessions };
}

/** Mở khóa khóa học, đang thi, hoặc đủ mốc buổi — khớp nút Phòng thi. */
export function canStartCertificationSubject({
  student,
  enrollments,
  subjectId,
  catalog,
  examProgressEntry,
  now,
} = {}) {
  if (!canEnterCertificationExam(examProgressEntry, now)) return false;
  const unlocked = isExamUnlockedForSubject(
    enrollments,
    subjectId,
    catalog,
    student?.studentExamUnlocked === true || student?.examApproved === true,
  );
  if (unlocked) return true;
  const ids = getSubjectIdsForStudent(enrollments, student?.course, catalog);
  if (examMilestone(ids, subjectId, student?.completedSessions, student?.totalSessions).meetsMilestone) {
    return true;
  }
  return findEnrollmentsForSubject(enrollments, subjectId, catalog).some((enr) => {
    const eids = getSubjectIdsForEnrollment(enr, catalog);
    return examMilestone(eids, subjectId, enr.completedSessions, enr.totalSessions).meetsMilestone;
  });
}

export function resolveExamFilterStatus(subject) {
  if (subject.lockUntil && subject.lockUntil > Date.now()) return 'rot';
  if (subject.status === 'khong_dat') return 'rot';
  if (subject.status === 'dat' || subject.status === 'dang_thi') return 'da_thi';
  return 'chua_thi';
}

export function getExamSubjectMeta(subjectId, catalog) {
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const base = cat[subjectId] || {
    id: subjectId,
    label: subjectId,
    bg: 'bg-gray-600',
  };
  return { ...base, short: getExamSubjectInitials(base) };
}

export const EXAM_SUBJECT_OPTIONS = getExamSubjectOptions(BUILTIN_EXAM_SUBJECTS);

export function formatExamSubjectsSummary(examSubjects, catalog) {
  const ids = Array.isArray(examSubjects) ? examSubjects : [];
  if (!ids.length) return '\u2014';
  return ids.map((id) => getExamSubjectMeta(id, catalog).label).join(', ');
}

export function formatSubjectIdsAsSpecialty(subjectIds, catalog) {
  const ids = Array.isArray(subjectIds) ? subjectIds : [];
  if (!ids.length) return '';
  return ids.map((id) => getExamSubjectMeta(id, catalog).label).join(', ');
}

export function parseSpecialtyToSubjectIds(specialty, catalog = BUILTIN_EXAM_SUBJECTS) {
  const text = String(specialty || '').trim();
  if (!text) return [];
  const cat = catalog || BUILTIN_EXAM_SUBJECTS;
  const parts = text.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean);
  const ids = new Set();

  const entries = Object.entries(cat)
    .map(([id, meta]) => ({
      id,
      labelN: normalizeCourseKey(meta.label || ''),
      idN: normalizeCourseKey(id),
    }))
    .sort((a, b) => b.labelN.length - a.labelN.length);

  for (const part of parts) {
    const np = normalizeCourseKey(part);
    if (!np) continue;

    const byLabel = entries.find((e) => e.labelN === np);
    if (byLabel) {
      ids.add(byLabel.id);
      continue;
    }

    const byId = entries.find((e) => e.idN === np || e.id === String(part).toLowerCase());
    if (byId) {
      ids.add(byId.id);
      continue;
    }
  }

  if (!ids.size) {
    mapCourseToExamSubjectIds(text, cat).forEach((id) => ids.add(id));
  }

  return [...ids];
}

export function resolveTeacherSubjectIds(teacher, catalog = BUILTIN_EXAM_SUBJECTS) {
  const fromIds = Array.isArray(teacher?.subjectIds) ? teacher.subjectIds.filter(Boolean) : [];
  if (fromIds.length) return fromIds;
  return parseSpecialtyToSubjectIds(teacher?.specialty, catalog);
}
