/**
 * NGÂN HÀNG CÂU HỎI - BÀI TEST GIẢNG VIÊN TIN HỌC
 * Thắng Tin Học - 50 câu / 4 phần
 *
 * section: 'excel' | 'word' | 'powerpoint' | 'situation'
 * correct: index của đáp án đúng (0-based)
 */
export const QUESTION_BANK = [

  // ════════════════════════════════════════════════════════════
  // PHẦN 1: EXCEL NÂNG CAO (15 câu)
  // ════════════════════════════════════════════════════════════
  {
    id: 'ex01', section: 'excel',
    q: 'Hàm VLOOKUP tìm kiếm giá trị theo:',
    options: ['Hàng ngang (từ trái sang phải)', 'Cột dọc (từ trên xuống dưới)', 'Cả hàng và cột', 'Theo điều kiện If'],
    correct: 1,
  },
  {
    id: 'ex02', section: 'excel',
    q: 'Cú pháp đúng của VLOOKUP là:',
    options: [
      '=VLOOKUP(lookup_value, table_array, col_index, [range_lookup])',
      '=VLOOKUP(table_array, lookup_value, row_index)',
      '=VLOOKUP(col_index, lookup_value, table_array)',
      '=VLOOKUP(lookup_value, col_index, table_array)',
    ],
    correct: 0,
  },
  {
    id: 'ex03', section: 'excel',
    q: 'Khi tham số range_lookup trong VLOOKUP = FALSE, hàm sẽ:',
    options: [
      'Tìm kiếm gần đúng',
      'Tìm kiếm chính xác tuyệt đối',
      'Bỏ qua lỗi #N/A',
      'Sắp xếp dữ liệu trước khi tìm',
    ],
    correct: 1,
  },
  {
    id: 'ex04', section: 'excel',
    q: 'Pivot Table trong Excel dùng để:',
    options: [
      'Tạo biểu đồ động',
      'Tóm tắt, phân tích và tổng hợp dữ liệu lớn nhanh chóng',
      'Lọc dữ liệu trùng lặp',
      'Vẽ sơ đồ tổ chức',
    ],
    correct: 1,
  },
  {
    id: 'ex05', section: 'excel',
    q: 'Để tạo Pivot Table, bạn vào tab nào?',
    options: ['Home → PivotTable', 'Insert → PivotTable', 'Data → PivotTable', 'View → PivotTable'],
    correct: 1,
  },
  {
    id: 'ex06', section: 'excel',
    q: 'Hàm SUMIFS dùng để:',
    options: [
      'Cộng tổng không điều kiện',
      'Cộng tổng với NHIỀU điều kiện cùng lúc',
      'Cộng tổng với một điều kiện',
      'Đếm ô thỏa điều kiện',
    ],
    correct: 1,
  },
  {
    id: 'ex07', section: 'excel',
    q: 'Cú pháp SUMIFS là:',
    options: [
      '=SUMIFS(criteria_range1, criteria1, sum_range)',
      '=SUMIFS(sum_range, criteria_range1, criteria1, ...)',
      '=SUMIFS(sum_range, criteria1, criteria_range1)',
      '=SUMIFS(criteria1, sum_range, criteria_range1)',
    ],
    correct: 1,
  },
  {
    id: 'ex08', section: 'excel',
    q: 'Hàm IFS (Excel 2019+) khác IF thông thường ở điểm nào?',
    options: [
      'IFS chỉ xử lý được số, IF xử lý được cả văn bản',
      'IFS cho phép kiểm tra nhiều điều kiện liên tiếp mà không cần lồng nhau',
      'IFS nhanh hơn IF 10 lần',
      'IFS và IF hoàn toàn giống nhau',
    ],
    correct: 1,
  },
  {
    id: 'ex09', section: 'excel',
    q: 'Hàm COUNTIFS đếm số ô thỏa mãn:',
    options: ['Chỉ 1 điều kiện duy nhất', 'Nhiều điều kiện cùng lúc', 'Điều kiện text hoặc số', 'Điều kiện ngày tháng'],
    correct: 1,
  },
  {
    id: 'ex10', section: 'excel',
    q: 'Để tham chiếu tuyệt đối trong Excel, bạn dùng ký tự:',
    options: ['@', '#', '$', '&'],
    correct: 2,
  },
  {
    id: 'ex11', section: 'excel',
    q: 'Kết quả của =IF(5>3, "Đúng", "Sai") là:',
    options: ['Sai', 'Đúng', '5>3', 'TRUE'],
    correct: 1,
  },
  {
    id: 'ex12', section: 'excel',
    q: 'Slicer trong Pivot Table dùng để:',
    options: [
      'Cắt xén dữ liệu ngoài bảng',
      'Lọc dữ liệu trực quan bằng nút bấm',
      'Tạo biểu đồ từ Pivot Table',
      'Định dạng số trong Pivot Table',
    ],
    correct: 1,
  },
  {
    id: 'ex13', section: 'excel',
    q: 'Hàm IFERROR trong Excel dùng để:',
    options: [
      'Trả về lỗi để kiểm tra',
      'Bắt lỗi và trả về giá trị thay thế khi có lỗi',
      'Đếm số ô lỗi',
      'Xóa các ô lỗi',
    ],
    correct: 1,
  },
  {
    id: 'ex14', section: 'excel',
    q: 'Để "đóng băng" hàng tiêu đề khi cuộn trong Excel, bạn dùng:',
    options: [
      'Home → Freeze',
      'View → Freeze Panes → Freeze Top Row',
      'Data → Freeze',
      'Insert → Freeze Row',
    ],
    correct: 1,
  },
  {
    id: 'ex15', section: 'excel',
    q: 'Khi Pivot Table hiển thị lỗi, cách tốt nhất để thay bằng giá trị 0 là:',
    options: [
      'Xóa dữ liệu gốc',
      'PivotTable Options → For error values show: 0',
      'Dùng IFERROR bên trong Pivot Table',
      'Refresh lại Pivot Table',
    ],
    correct: 1,
  },

  // ════════════════════════════════════════════════════════════
  // PHẦN 2: WORD (12 câu)
  // ════════════════════════════════════════════════════════════
  {
    id: 'wo01', section: 'word',
    q: 'Mail Merge trong Word dùng để:',
    options: [
      'Gộp nhiều file Word thành một',
      'Trộn thư - tạo nhiều thư/nhãn/phong bì từ một mẫu và nguồn dữ liệu',
      'Gửi email trực tiếp từ Word',
      'So sánh hai phiên bản văn bản',
    ],
    correct: 1,
  },
  {
    id: 'wo02', section: 'word',
    q: 'Nguồn dữ liệu (Data Source) cho Mail Merge có thể là:',
    options: [
      'Chỉ file Excel',
      'Chỉ danh sách trong Word',
      'Excel, Access, danh sách Word, Outlook Contacts...',
      'Chỉ file CSV',
    ],
    correct: 2,
  },
  {
    id: 'wo03', section: 'word',
    q: 'Section Break "Next Page" trong Word dùng để:',
    options: [
      'Ngắt dòng đơn giản',
      'Tạo Section mới bắt đầu từ trang mới (có thể thay đổi hướng, margin riêng)',
      'Chèn trang trắng',
      'Ngắt cột trong văn bản cột',
    ],
    correct: 1,
  },
  {
    id: 'wo04', section: 'word',
    q: 'Sự khác biệt giữa Page Break và Section Break là:',
    options: [
      'Hoàn toàn giống nhau',
      'Page Break chỉ ngắt trang, Section Break tạo vùng văn bản mới có thể cài đặt riêng',
      'Section Break không ngắt trang',
      'Page Break tạo section mới',
    ],
    correct: 1,
  },
  {
    id: 'wo05', section: 'word',
    q: 'Table of Contents (Mục lục tự động) trong Word được tạo từ:',
    options: [
      'Văn bản được bôi đậm',
      'Các Heading Style (Heading 1, 2, 3...)',
      'Danh sách đánh số tự động',
      'Các bookmark trong văn bản',
    ],
    correct: 1,
  },
  {
    id: 'wo06', section: 'word',
    q: 'Để cập nhật Table of Contents sau khi chỉnh sửa nội dung, bạn:',
    options: [
      'Xóa và tạo mục lục mới',
      'Click vào mục lục → Update Table',
      'Lưu file và mục lục tự cập nhật',
      'Dùng Ctrl+A để chọn tất cả rồi xóa',
    ],
    correct: 1,
  },
  {
    id: 'wo07', section: 'word',
    q: 'Theo quy định văn bản hành chính Việt Nam, font chữ chuẩn là:',
    options: ['Arial 12pt', 'Times New Roman 13pt', 'Calibri 11pt', 'Tahoma 12pt'],
    correct: 1,
  },
  {
    id: 'wo08', section: 'word',
    q: 'Để căn chỉnh lề văn bản hành chính (trên 2cm, dưới 2cm, trái 3cm, phải 1.5cm), bạn vào:',
    options: [
      'Home → Paragraph → Indents and Spacing',
      'Layout → Margins → Custom Margins',
      'View → Ruler',
      'Insert → Header and Footer',
    ],
    correct: 1,
  },
  {
    id: 'wo09', section: 'word',
    q: 'Trong một bảng (Table) Word, để gộp nhiều ô thành một ô, bạn dùng:',
    options: ['Split Cells', 'Merge Cells', 'AutoFit', 'Insert Above'],
    correct: 1,
  },
  {
    id: 'wo10', section: 'word',
    q: 'Để tạo đầu trang (Header) khác nhau cho từng Section, bạn cần:',
    options: [
      'Bất kỳ cài đặt nào cũng được',
      'Tắt tùy chọn "Link to Previous" trong mỗi Section',
      'Tạo nhiều file Word',
      'Dùng Text Box thay Header',
    ],
    correct: 1,
  },
  {
    id: 'wo11', section: 'word',
    q: 'Track Changes trong Word dùng để:',
    options: [
      'Theo dõi số lần lưu file',
      'Hiển thị và lưu lại các chỉnh sửa để người khác duyệt',
      'Theo dõi thời gian soạn thảo',
      'So sánh hai file Word',
    ],
    correct: 1,
  },
  {
    id: 'wo12', section: 'word',
    q: 'Định dạng số trang "Trang 1 của 5" trong Footer, bạn dùng field nào?',
    options: [
      '{ PAGE } và { NUMPAGES }',
      '{ PAGECOUNT } và { TOTAL }',
      'NumPage và TotalPage',
      'Page() và Pages()',
    ],
    correct: 0,
  },

  // ════════════════════════════════════════════════════════════
  // PHẦN 3: POWERPOINT (12 câu)
  // ════════════════════════════════════════════════════════════
  {
    id: 'pp01', section: 'powerpoint',
    q: 'Slide Master trong PowerPoint dùng để:',
    options: [
      'Tạo slide đầu tiên của bài trình chiếu',
      'Thiết kế template áp dụng đồng nhất cho toàn bộ slide',
      'Khóa các slide quan trọng',
      'Tạo hiệu ứng chuyển slide',
    ],
    correct: 1,
  },
  {
    id: 'pp02', section: 'powerpoint',
    q: 'Để vào chế độ Slide Master, bạn vào:',
    options: ['Home → Slide Master', 'View → Slide Master', 'Design → Slide Master', 'Insert → Slide Master'],
    correct: 1,
  },
  {
    id: 'pp03', section: 'powerpoint',
    q: 'Transition trong PowerPoint là:',
    options: [
      'Hiệu ứng chuyển động của object trong slide',
      'Hiệu ứng chuyển đổi giữa các slide',
      'Âm thanh nền của toàn bài',
      'Cách bố trí layout của slide',
    ],
    correct: 1,
  },
  {
    id: 'pp04', section: 'powerpoint',
    q: 'Để các hiệu ứng Transition áp dụng cho TẤT CẢ slide, bạn nhấn:',
    options: [
      'Ctrl+A rồi chọn Transition',
      '"Apply to All" trong tab Transitions',
      'Chuột phải → Apply to All',
      'Slide Master → Transitions',
    ],
    correct: 1,
  },
  {
    id: 'pp05', section: 'powerpoint',
    q: 'Animation Pane trong PowerPoint dùng để:',
    options: [
      'Xem tất cả slide thu nhỏ',
      'Quản lý, sắp xếp thứ tự và thời gian của các hiệu ứng animation',
      'Tạo âm thanh cho animation',
      'Export animation thành video',
    ],
    correct: 1,
  },
  {
    id: 'pp06', section: 'powerpoint',
    q: 'Trigger trong PowerPoint Animation cho phép:',
    options: [
      'Kích hoạt hiệu ứng tự động theo thời gian',
      'Kích hoạt hiệu ứng khi click vào một object cụ thể',
      'Tắt tất cả animation',
      'Chuyển slide tự động',
    ],
    correct: 1,
  },
  {
    id: 'pp07', section: 'powerpoint',
    q: 'Để xem bài trình chiếu ở chế độ Presenter View (có ghi chú riêng), bạn:',
    options: [
      'F5 để bắt đầu trình chiếu',
      'Slide Show → Use Presenter View (khi kết nối màn hình phụ)',
      'View → Normal',
      'F12 → Presenter',
    ],
    correct: 1,
  },
  {
    id: 'pp08', section: 'powerpoint',
    q: 'Morph Transition (PowerPoint 365) tạo hiệu ứng:',
    options: [
      'Slide chuyển động vào từ phía trái',
      'Object trên slide biến đổi/di chuyển mượt mà sang slide tiếp theo',
      'Âm thanh morphing',
      'Slide xoay 3D',
    ],
    correct: 1,
  },
  {
    id: 'pp09', section: 'powerpoint',
    q: 'Cách export bài PPT thành video (.mp4) là:',
    options: [
      'Save As → Video',
      'File → Export → Create a Video',
      'Insert → Video',
      'Slide Show → Record → Export',
    ],
    correct: 1,
  },
  {
    id: 'pp10', section: 'powerpoint',
    q: 'Để nhóm nhiều object lại thành một group, bạn dùng phím tắt:',
    options: ['Ctrl+G', 'Ctrl+Shift+G', 'Alt+G', 'Ctrl+Alt+G'],
    correct: 0,
  },
  {
    id: 'pp11', section: 'powerpoint',
    q: 'Hiệu ứng "Entrance" trong Animation là:',
    options: [
      'Object biến mất khỏi slide',
      'Object xuất hiện vào slide',
      'Object di chuyển trong slide',
      'Object thay đổi màu sắc',
    ],
    correct: 1,
  },
  {
    id: 'pp12', section: 'powerpoint',
    q: 'Section trong PowerPoint dùng để:',
    options: [
      'Chia slide thành nhiều phần nhỏ để quản lý dễ hơn',
      'Tạo animation section',
      'Áp dụng Transition khác nhau',
      'Giống Section Break trong Word',
    ],
    correct: 0,
  },

  // ════════════════════════════════════════════════════════════
  // PHẦN 4: TÌNH HUỐNG SƯ PHẠM (11 câu)
  // ════════════════════════════════════════════════════════════
  {
    id: 'si01', section: 'situation',
    q: 'Học viên không hiểu bài sau khi bạn giải thích 2 lần, bạn nên:',
    options: [
      'Bảo học viên về nhà tự học thêm',
      'Thay đổi cách giải thích, dùng ví dụ thực tế gần gũi với học viên và thực hành trực tiếp',
      'Bỏ qua và tiếp tục bài mới',
      'Gọi giảng viên khác vào giải thích',
    ],
    correct: 1,
  },
  {
    id: 'si02', section: 'situation',
    q: 'Máy tính học viên bị treo giữa buổi học, bạn làm gì đầu tiên?',
    options: [
      'Mắng học viên vì không bảo quản máy',
      'Bình tĩnh kiểm tra, thử Ctrl+Alt+Del, nếu không được mới khởi động lại',
      'Ngay lập tức tắt nguồn máy',
      'Gọi điện cho kỹ thuật viên rồi nghỉ buổi đó',
    ],
    correct: 1,
  },
  {
    id: 'si03', section: 'situation',
    q: 'Học viên hỏi một câu hỏi mà bạn chưa chắc câu trả lời, bạn nên:',
    options: [
      'Bịa câu trả lời để không mất uy tín',
      'Trả lời thẳng thắn "Câu hỏi hay! Hãy để tôi kiểm tra lại và trả lời em chính xác sau"',
      'Lờ câu hỏi và tiếp tục bài',
      'Mắng học viên hỏi lạc đề',
    ],
    correct: 1,
  },
  {
    id: 'si04', section: 'situation',
    q: 'Học viên quên lưu file và máy bị sập nguồn đột ngột, bạn hướng dẫn:',
    options: [
      'Làm lại file từ đầu',
      'Mở lại ứng dụng và vào AutoRecover/Document Recovery để khôi phục',
      'Tìm trong Recycle Bin',
      'Cài lại ứng dụng',
    ],
    correct: 1,
  },
  {
    id: 'si05', section: 'situation',
    q: 'Một học viên học nhanh, luôn xong bài trước các bạn, bạn nên:',
    options: [
      'Yêu cầu họ ngồi chờ các bạn',
      'Giao thêm bài tập nâng cao hoặc nhờ họ hỗ trợ các học viên yếu hơn',
      'Cho về sớm',
      'Không làm gì',
    ],
    correct: 1,
  },
  {
    id: 'si06', section: 'situation',
    q: 'Học viên phàn nàn bài học quá khó, bạn xử lý như thế nào?',
    options: [
      'Nói học viên cần cố gắng hơn',
      'Lắng nghe, đánh giá lại tốc độ giảng dạy và điều chỉnh phù hợp với học viên',
      'Báo cáo học viên lên Ban giám đốc',
      'Bỏ qua phàn nàn',
    ],
    correct: 1,
  },
  {
    id: 'si07', section: 'situation',
    q: 'Trong buổi học, học viên dùng điện thoại liên tục, bạn sẽ:',
    options: [
      'Tịch thu điện thoại ngay',
      'Nhắc nhở nhẹ nhàng, giải thích lý do và đặt quy tắc lớp học rõ ràng',
      'Mặc kệ vì đó là quyền của học viên',
      'Kết thúc buổi học sớm',
    ],
    correct: 1,
  },
  {
    id: 'si08', section: 'situation',
    q: 'Excel báo lỗi #REF! trong công thức của học viên, nguyên nhân thường là:',
    options: [
      'Công thức sai cú pháp',
      'Ô được tham chiếu đã bị xóa hoặc di chuyển',
      'Giá trị nhập sai định dạng',
      'File Excel bị lỗi',
    ],
    correct: 1,
  },
  {
    id: 'si09', section: 'situation',
    q: 'Học viên hỏi cách học để thi chứng chỉ MOS, bạn tư vấn:',
    options: [
      'Chỉ cần học lý thuyết, không cần thực hành',
      'Kết hợp học lý thuyết + thực hành nhiều bài thi thử + làm quen giao diện thi',
      'Mua tài liệu đọc là đủ',
      'Học theo YouTube là được',
    ],
    correct: 1,
  },
  {
    id: 'si10', section: 'situation',
    q: 'Khi giảng dạy online qua Google Meet, kết nối mạng yếu, bạn nên:',
    options: [
      'Hủy buổi học ngay lập tức',
      'Thông báo cho học viên, tắt camera để ổn định đường truyền, chia sẻ màn hình thay vì video',
      'Tiếp tục bình thường',
      'Bắt học viên tự vào trung tâm học',
    ],
    correct: 1,
  },
  {
    id: 'si11', section: 'situation',
    q: 'Học viên nộp bài tập nhưng công thức Excel bị lỗi #VALUE!, bạn giải thích:',
    options: [
      'File bị virus',
      'Một trong các ô tham chiếu chứa văn bản thay vì số, hoặc kiểu dữ liệu không tương thích',
      'Phiên bản Excel quá cũ',
      'Cần cài thêm Add-in',
    ],
    correct: 1,
  },
];

// ── Hàm lấy ngẫu nhiên N câu, đảm bảo đủ các phần ──────────────────────────
export const getRandomQuestions = (total = 10) => {
  const sections = ['excel', 'word', 'powerpoint', 'situation'];

  // Lấy ít nhất 2 câu mỗi phần, còn lại random
  const perSection  = 2;
  const extraSlots  = total - sections.length * perSection; // = 10 - 8 = 2

  let selected = [];

  sections.forEach((section) => {
    const pool = QUESTION_BANK.filter((q) => q.section === section);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, perSection));
  });

  // Lấy thêm câu random từ toàn bộ ngân hàng (không trùng)
  const remaining = QUESTION_BANK
    .filter((q) => !selected.find((s) => s.id === q.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, extraSlots);

  selected.push(...remaining);

  // Xáo trộn thứ tự cuối cùng
  return selected.sort(() => Math.random() - 0.5);
};

// ── Hàm chấm điểm theo phần ────────────────────────────────────────────────
export const gradeAnswers = (questions, answers) => {
  const result = { excel: 0, word: 0, powerpoint: 0, situation: 0, total: 0 };
  const count  = { excel: 0, word: 0, powerpoint: 0, situation: 0 };

  questions.forEach((q, i) => {
    // Chỉ chấm điểm tự động cho trắc nghiệm (multiple) hoặc câu hỏi không có type (mặc định trắc nghiệm)
    if (!q.type || q.type === 'multiple') {
      count[q.section] = (count[q.section] || 0) + 1;
      if (answers[i] === q.correct) {
        result[q.section] = (result[q.section] || 0) + 1;
      }
    }
    // Tự luận (essay) hiện tại bỏ qua trong phần chấm điểm tự động (%)
  });

  const mcCount = Object.values(count).reduce((a, b) => a + b, 0);
  const correct = Object.values(result).reduce((a, b) => a + b, 0);
  result.total  = mcCount > 0 ? Math.round((correct / mcCount) * 100) : 0;
  result.count  = count;

  // PASS: tổng ≥ 80 VÀ mỗi phần trắc nghiệm đúng ≥ 50%
  result.pass = result.total >= 80
    && Object.keys(count).every(
      (sec) => count[sec] === 0 || (result[sec] / count[sec]) >= 0.5
    );

  return result;
};
