import React, { useEffect } from 'react';

/**
 * SecurityGuard Component
 * Bảo vệ website cơ bản bằng cách chặn phím tắt Inspect và Chuột phải.
 * Lưu ý: Đây chỉ là biện pháp ngăn chặn người dùng phổ thông, 
 * không thể ngăn chặn 100% các lập trình viên chuyên nghiệp.
 */
const SecurityGuard = () => {
  useEffect(() => {
    // 1. Chặn chuột phải (Context Menu)
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    // 2. Chặn các phím tắt Debugging (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
    const handleKeyDown = (e) => {
      // F12
      if (e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      // Ctrl + Shift + I (Inspect)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        return false;
      }
      // Ctrl + Shift + J (Console)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
        e.preventDefault();
        return false;
      }
      // Ctrl + U (View Source)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        return false;
      }
      // Ctrl + S (Save Page)
      if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        return false;
      }
    };

    // 3. Phát hiện mở DevTools bằng cách kiểm tra sự thay đổi kích thước cửa sổ (Optional)
    // Hoặc sử dụng debugger loop (Mạnh mẽ hơn nhưng gây phiền nhiễu khi dev)
    const interval = setInterval(() => {
      const before = new Date().getTime();
      debugger;
      const after = new Date().getTime();
      if (after - before > 100) {
        // void 0
      }
    }, 1000);

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      clearInterval(interval);
    };
  }, []);

  return null; // Component không hiển thị giao diện
};

export default SecurityGuard;
