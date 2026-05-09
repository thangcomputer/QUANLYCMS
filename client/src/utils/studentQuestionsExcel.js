import * as XLSX from 'xlsx';

export const STUDENT_QUESTIONS_TEMPLATE_HEADERS = [
  'Loại',
  'Phần thi',
  'Độ khó',
  'Câu hỏi',
  'Đáp án A',
  'Đáp án B',
  'Đáp án C',
  'Đáp án D',
  'Đáp án đúng',
  'Gợi ý trả lời (tự luận)',
];

const SECTION_LABEL_TO_CODE = {
  'microsoft excel': 'excel',
  excel: 'excel',
  'microsoft word': 'word',
  word: 'word',
  'microsoft powerpoint': 'powerpoint',
  powerpoint: 'powerpoint',
  'may tinh & windows': 'computer',
  computer: 'computer',
  'tinh huong su pham': 'situation',
  situation: 'situation',
  'kien thuc khac': 'other',
  other: 'other',
};

const DIFF_LABEL_TO_CODE = {
  'co ban': 'easy',
  easy: 'easy',
  'trung binh': 'medium',
  medium: 'medium',
  'nang cao': 'hard',
  hard: 'hard',
};

function stripVi(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pick(row, aliases) {
  const entries = Object.entries(row || {});
  for (const [k, v] of entries) {
    const kn = stripVi(k);
    for (const raw of aliases) {
      const w = stripVi(raw);
      if (w === '' && raw !== 0) continue;
      if (kn === w) return v;
      const rawTrim = String(raw ?? '').trim();
      if (/^[ABCD]$/i.test(rawTrim)) continue;
      if (kn.includes(w) || w.includes(kn)) return v;
    }
  }
  return undefined;
}

function parseSection(val) {
  if (val == null || val === '') return null;
  const key = stripVi(String(val));
  if (SECTION_LABEL_TO_CODE[key]) return SECTION_LABEL_TO_CODE[key];
  for (const [label, code] of Object.entries(SECTION_LABEL_TO_CODE)) {
    if (key === stripVi(label)) return code;
  }
  return null;
}

function parseDifficulty(val) {
  if (val == null || val === '') return 'medium';
  const key = stripVi(String(val));
  if (DIFF_LABEL_TO_CODE[key]) return DIFF_LABEL_TO_CODE[key];
  for (const [label, code] of Object.entries(DIFF_LABEL_TO_CODE)) {
    if (key === stripVi(label)) return code;
  }
  return 'medium';
}

function parseType(val) {
  const t = stripVi(String(val || ''));
  if (!t) return 'multiple';
  if (t.includes('tu luan') || t.includes('essay') || t === 'tl') return 'essay';
  return 'multiple';
}

function parseCorrectIndex(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  const letter = s.match(/^[ABCD]$/);
  if (letter) return letter[0].charCodeAt(0) - 65;
  const n = Number(s);
  if (!Number.isNaN(n)) {
    if (n >= 1 && n <= 4) return n - 1;
    if (n >= 0 && n <= 3) return n;
  }
  const lower = String(raw).trim().toLowerCase();
  const map = { a: 0, b: 1, c: 2, d: 3 };
  if (map[lower] !== undefined) return map[lower];
  return null;
}

function buildWorkbook(kind) {
  const isTeacher = kind === 'teacher';
  const sampleMc = {
    Loại: 'Trắc nghiệm',
    'Phần thi': 'Microsoft Excel',
    'Độ khó': 'Trung bình',
    'Câu hỏi': 'Hàm SUM trong Excel dùng để làm gì?',
    'Đáp án A': 'Đếm ô',
    'Đáp án B': 'Cộng tổng',
    'Đáp án C': 'Tìm giá trị lớn nhất',
    'Đáp án D': 'Lọc dữ liệu',
    'Đáp án đúng': 'B',
    'Gợi ý trả lời (tự luận)': '',
  };
  const sampleEssay = {
    Loại: 'Tự luận',
    'Phần thi': isTeacher ? 'Tình Huống Sư Phạm' : 'Microsoft Word',
    'Độ khó': 'Cơ bản',
    'Câu hỏi': isTeacher
      ? 'Học viên thường xuyên đi trễ, bạn xử lý thế nào?'
      : 'Trình bày các bước tạo mục lục tự động trong Word.',
    'Đáp án A': '',
    'Đáp án B': '',
    'Đáp án C': '',
    'Đáp án D': '',
    'Đáp án đúng': '',
    'Gợi ý trả lời (tự luận)': isTeacher
      ? 'Trao doi 1-1, quy uoc lop, ghi nhan...'
      : 'Dung Heading, References → Table of Contents...',
  };
  const ws = XLSX.utils.json_to_sheet([sampleMc, sampleEssay], {
    header: STUDENT_QUESTIONS_TEMPLATE_HEADERS,
  });
  ws['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 48 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 14 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cau hoi');
  const title = isTeacher ? 'NGAN HANG CAU HOI GIANG VIEN' : 'NGAN HANG CAU HOI HOC VIEN';
  const wsHuongDan = XLSX.utils.aoa_to_sheet([
    [`HUONG DAN - ${title}`],
    [],
    ['Loai:', 'Trac nghiem hoac Tu luan'],
    ['Phan thi:', 'Excel | Word | PowerPoint | May tinh & Windows | Tinh Huong Su Pham | Kien thuc Khac'],
    ['', 'Hoac ma: excel, word, powerpoint, computer, situation, other'],
    ['Do kho:', 'Co ban | Trung binh | Nang cao'],
    ['Dap an dung (TN):', 'A-D hoac 1-4'],
    ['Goi y:', 'Chi cho cau Tu luan'],
    [],
    ['Sheet "Cau hoi":', 'Giu hang tieu de cot, xoa dong mau roi them cau moi.'],
    [],
    [isTeacher ? 'File: Mau_NganHang_CauHoi_GiangVien.xlsx' : 'File: Mau_NganHang_CauHoi_HocVien.xlsx'],
  ]);
  XLSX.utils.book_append_sheet(wb, wsHuongDan, 'Huong dan');
  return wb;
}

export function downloadStudentQuestionsExcelTemplate() {
  const wb = buildWorkbook('student');
  XLSX.writeFile(wb, 'Mau_NganHang_CauHoi_HocVien.xlsx');
}

export function downloadTeacherQuestionsExcelTemplate() {
  const wb = buildWorkbook('teacher');
  XLSX.writeFile(wb, 'Mau_NganHang_CauHoi_GiangVien.xlsx');
}

/** Cung format cot voi hoc vien — dung chung parser. */
export function parseQuestionBankExcel(bstr) {
  return parseStudentQuestionsExcel(bstr);
}

export function parseStudentQuestionsExcel(bstr) {
  const errors = [];
  const questions = [];
  let skipped = 0;

  let wb;
  try {
    wb = XLSX.read(bstr, { type: 'binary' });
  } catch (e) {
    return { questions: [], errors: ['Khong doc duoc file Excel.'], skipped: 0 };
  }

  const sheetName =
    wb.SheetNames.find((n) => stripVi(n).includes('cau hoi')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { questions: [], errors: ['File khong co sheet du lieu.'], skipped: 0 };
  }

  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!raw.length) {
    return {
      questions: [],
      errors: ['Sheet khong co dong du lieu.'],
      skipped: 0,
    };
  }

  raw.forEach((row, idx) => {
    const line = idx + 2;
    const qText = pick(row, ['Câu hỏi', 'Cau hoi', 'Question', 'Noi dung', 'Noi dung']);
    const strQ = String(qText ?? '').trim();
    if (!strQ) {
      skipped += 1;
      return;
    }

    const type = parseType(pick(row, ['Loại', 'Loai', 'Type']));
    const section = parseSection(pick(row, ['Phần thi', 'Phan thi', 'Section', 'Mon']));
    if (!section) {
      errors.push(`Dong ${line}: Phan thi khong hop le (vd: Microsoft Excel).`);
      return;
    }

    const difficulty = parseDifficulty(pick(row, ['Độ khó', 'Do kho', 'Difficulty']));

    if (type === 'essay') {
      const sampleAnswer = String(
        pick(row, [
          'Gợi ý trả lời (tự luận)',
          'Goi y tra loi (tu luan)',
          'Gợi ý',
          'Goi y',
          'sampleAnswer',
        ]) ?? ''
      ).trim();
      questions.push({
        type: 'essay',
        section,
        difficulty,
        q: strQ,
        options: ['', '', '', ''],
        correct: 0,
        sampleAnswer: sampleAnswer || '',
        attachedFile: null,
      });
      return;
    }

    const oa = String(pick(row, ['Đáp án A', 'Dap an A', 'Option A', 'A']) ?? '').trim();
    const ob = String(pick(row, ['Đáp án B', 'Dap an B', 'Option B', 'B']) ?? '').trim();
    const oc = String(pick(row, ['Đáp án C', 'Dap an C', 'Option C', 'C']) ?? '').trim();
    const od = String(pick(row, ['Đáp án D', 'Dap an D', 'Option D', 'D']) ?? '').trim();
    const nonempty = [oa, ob, oc, od].filter((t) => t && String(t).trim());
    if (nonempty.length < 2) {
      errors.push(`Dong ${line}: Trac nghiem can it nhat 2 dap an.`);
      return;
    }

    const fullOpts = [oa || '', ob || '', oc || '', od || ''];
    const correctRaw = pick(row, ['Đáp án đúng', 'Dap an dung', 'Correct', 'Dung']);
    const correct = parseCorrectIndex(correctRaw);
    if (correct === null) {
      errors.push(`Dong ${line}: Thieu hoac sai "Dap an dung" (A-D).`);
      return;
    }
    if (!fullOpts[correct] || !String(fullOpts[correct]).trim()) {
      errors.push(`Dong ${line}: Dap an dung tro vao o trong.`);
      return;
    }

    questions.push({
      type: 'multiple',
      section,
      difficulty,
      q: strQ,
      options: fullOpts.map((t) => String(t).trim()),
      correct,
      sampleAnswer: '',
    });
  });

  return { questions, errors, skipped };
}
