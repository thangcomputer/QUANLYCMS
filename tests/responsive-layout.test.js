const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('DashboardLayout header dùng bố cục co giãn (wrap / cột)', async () => {
  const src = await fs.readFile(
    path.resolve(__dirname, '../client/src/components/DashboardLayout.jsx'),
    'utf8'
  );
  assert.ok(src.includes('flex-wrap'), 'Header cần flex-wrap để không ép một hàng');
  assert.ok(
    src.includes('flex-col') && src.includes('sm:flex-row'),
    'Header nhỏ: cột, lớn hơn: hàng ngang'
  );
});

test('AdminDashboard: học viên / tài chính / GV có breakpoints linh hoạt', async () => {
  const adminPath = path.resolve(__dirname, '../client/src/components/AdminDashboard.jsx');
  const src = await fs.readFile(adminPath, 'utf8');

  assert.ok(src.includes('touch-pan-x'), 'Bảng HV: cuộn ngang mượt trên touch');
  assert.ok(
    src.includes('flex-col gap-3 sm:flex-row') ||
      src.includes('flex-col gap-3 sm:flex-row sm:items'),
    'Tài chính: tiêu đề + nút xếp chồng khi hẹp'
  );
  assert.ok(
    src.includes('xl:flex-row') && src.includes('Duyệt Giảng Viên'),
    'Giảng viên: toolbar xếp cột → hàng xl'
  );
});

test('TeacherDashboard StudentCard: header không ép một flex-row cứng', async () => {
  const src = await fs.readFile(
    path.resolve(__dirname, '../client/src/components/TeacherDashboard.jsx'),
    'utf8'
  );
  assert.ok(src.includes('min-[440px]:flex-row'), 'Card HV GV: chồng layout rồi ngang >=440px');
});

test('StudentDashboard: lịch học, profile và modal nộp bài co giãn tốt', async () => {
  const src = await fs.readFile(
    path.resolve(__dirname, '../client/src/components/StudentDashboard.jsx'),
    'utf8'
  );
  assert.ok(src.includes('sm:flex-row sm:items-center sm:justify-between'), 'Các header section có breakpoint sm');
  assert.ok(src.includes('flex flex-col sm:flex-row items-stretch sm:items-center'), 'Form nộp bài không ép ngang');
});
