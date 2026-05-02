# QUANLYCMS

Full-stack CMS cho trung tâm đào tạo: **Express 5 + MongoDB + Socket.io**, frontend **React (Vite) + Tailwind**.

## Cấu trúc thư mục

- `server.js` — API và Socket.io
- `routes/`, `models/`, `middleware/` — backend
- `client/` — ứng dụng React (`npm run dev` trong `client/`)

## Chuẩn bị

1. **MongoDB** — URI kết nối  
2. **Node.js** — khuyến nghị LTS  

## Biến môi trường (backend)

Tạo file `.env` trong thư mục này (đã có trong `.gitignore`). Các biến thường dùng:

| Biến | Mô tả |
|------|--------|
| `MONGODB_URI` | Chuỗi kết nối MongoDB |
| `JWT_SECRET` | Ký JWT |
| `JWT_REFRESH_SECRET` | Ký refresh token (khuyến nghị khác `JWT_SECRET`) |
| `CLIENT_URL` | URL frontend (CORS / OAuth redirect) |
| `PORT` | Cổng API (mặc định `5000`) |

### Tuỳ chọn bảo mật & hiệu năng

| Biến | Mặc định | Mô tả |
|------|-----------|--------|
| `JSON_BODY_LIMIT` | `12mb` | Giới hạn body JSON (file upload vẫn qua Multer) |
| `TRUST_PROXY` | — | Đặt `1` khi chạy sau Nginx/Cloudflare (rate limit đúng IP) |
| `RATE_LIMIT_LOGIN_MAX` | `25` | Số request đăng nhập / 15 phút / IP |
| `RATE_LIMIT_CAPTCHA_MAX` | `120` | Số request CAPTCHA / 15 phút / IP |
| `RATE_LIMIT_REFRESH_MAX` | `200` | Số refresh token / 15 phút / IP |
| `RATE_LIMIT_SENSITIVE_MAX` | `20` | Đăng ký GV / quên MK / … / 1 giờ / IP |
| `RATE_LIMIT_CHECK_ROLE_MAX` | `60` | Kiểm tra role / 15 phút / IP |

## Chạy local

```bash
# Backend (thư mục gốc project chứa server.js)
npm install
npm run dev

# Frontend
cd client
npm install
npm run dev
```

Frontend (tuỳ chọn trong `client/.env`):

```env
VITE_API_URL=http://localhost:5000
```

Khi **không** đặt `VITE_API_URL`, `npm run dev` vẫn gọi được API nhờ **proxy** trong `client/vite.config.js` (`/api` → `http://localhost:5000`). Backend phải chạy trước hoặc cùng lúc.

## Kiểm tra nhanh

- API: `GET http://localhost:5000/`  
- Production: build client (`npm run build` trong `client/`), serve static hoặc đặt `CLIENT_URL` / `VITE_API_URL` cho đúng domain.

## Ghi chú

- Rate limiting áp dụng cho các endpoint `/api/auth/*` nhạy cảm (đăng nhập, CAPTCHA, refresh, quên mật khẩu, đăng ký GV).  
- Endpoint `POST /api/auth/refresh` trả về `{ success, accessToken }` (refresh token giữ nguyên cho đến khi đăng nhập lại hoặc hết hạn).
