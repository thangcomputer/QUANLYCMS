/**
 * BankSelect.jsx
 * 
 * Shared component + helper cho VietQR integration.
 * 
 * Exports:
 *  - generateVietQRUrl(bankCode, accountNumber, amount, description, accountName)
 *  - BankSelect  (controlled <select> component, fetches real bank list from VietQR API)
 */

import { useState, useEffect, useRef } from 'react';
import { Landmark, Loader2 } from 'lucide-react';

// ── In-memory cache để không fetch lại mỗi lần mount ────────────────────────
let _banksCache = null;
let _fetchPromise = null;

async function fetchBankList() {
  if (_banksCache) return _banksCache;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('https://api.vietqr.io/v2/banks')
    .then(r => r.json())
    .then(data => {
      const list = Array.isArray(data?.data) ? data.data : [];
      _banksCache = list;
      return list;
    })
    .catch(() => {
      _fetchPromise = null; // retry on next mount
      return [];
    });
  return _fetchPromise;
}

// ── VietQR URL generator ─────────────────────────────────────────────────────
/**
 * Tạo URL ảnh QR từ API VietQR (Quick Link / Image URL).
 * @param {string} bankCode   - shortName hoặc bin từ VietQR bank list (VD: 'mbbank', '970415')
 * @param {string} accountNumber
 * @param {number} amount
 * @param {string} description  - nội dung chuyển khoản
 * @param {string} accountName  - tên chủ tài khoản (UPPER_CASE)
 * @returns {string|null}       - URL ảnh QR hoặc null nếu thiếu bankCode/accountNumber
 */
export function generateVietQRUrl(bankCode, accountNumber, amount, description = '', accountName = '') {
  if (!bankCode || !accountNumber) return null;
  const params = new URLSearchParams({
    amount: String(Math.round(Number(amount) || 0)),
    addInfo: description,
    accountName: accountName,
  });
  return `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?${params.toString()}`;
}

// ── BankSelect component ─────────────────────────────────────────────────────
/**
 * Dropdown chọn ngân hàng, tự fetch danh sách từ VietQR API.
 * 
 * Props:
 *  - value        : string (bin hoặc shortName hiện tại)
 *  - onChange     : (bank: { bin, shortName, name, logo }) => void
 *  - className    : optional extra className cho <select>
 *  - placeholder  : optional string
 */
export function BankSelect({ value, onChange, className = '', placeholder = '— Chọn ngân hàng —' }) {
  const [banks, setBanks] = useState(_banksCache || []);
  const [loading, setLoading] = useState(!_banksCache);

  useEffect(() => {
    if (_banksCache) return;
    setLoading(true);
    fetchBankList().then(list => {
      setBanks(list);
      setLoading(false);
    });
  }, []);

  // Find selected bank object to display logo next to name
  const selected = banks.find(b => b.bin === value || b.shortName?.toLowerCase() === value?.toLowerCase());

  return (
    <div className="relative">
      <Landmark size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none z-10" />
      {loading && (
        <Loader2 size={14} className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none z-10" />
      )}
      <select
        value={value || ''}
        disabled={loading}
        onChange={e => {
          const bank = banks.find(b => b.bin === e.target.value);
          if (bank) onChange(bank);
        }}
        className={`w-full pl-9 pr-8 py-3 bg-white rounded-xl border-2 border-emerald-200 focus:border-emerald-400 outline-none text-sm appearance-none cursor-pointer transition disabled:opacity-60 ${className}`}
      >
        <option value="">{loading ? 'Đang tải danh sách ngân hàng...' : placeholder}</option>
        {banks.map(b => (
          <option key={b.bin} value={b.bin}>
            {b.shortName} — {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default BankSelect;
