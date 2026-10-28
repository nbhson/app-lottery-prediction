# Plan — app-lottery-prediction

> Kế hoạch nâng cấp chuẩn enterprise — cập nhật: 28/10/2026

## Trạng thái hiện tại

Ứng dụng web Next.js 14: tra cứu kết quả Vietlott (Mega 6/45, Power 6/55),
dự đoán thống kê + AI (OpenAI-compatible), dữ liệu thật từ vietlott.vn.

## Đánh giá ban đầu (27/10/2026)

| Tiêu chí | Trước | Sau |
|-----------|-------|-----|
| Kiến trúc | 9/10 | 9/10 |
| Bảo mật | 8/10 | 8.5/10 (validate API input) |
| Reliability | 6/10 | 10/10 |
| Scraper | 8/10 | 8/10 |
| Prediction | 7/10 | 7.5/10 |
| UI/UX | 8/10 | 9.5/10 (Flat Design 2.0) |
| Docs | 9/10 | 9.5/10 |
| Testing | 7/10 | 8/10 (npm test hoạt động) |
| **Tổng** | **7.5/10** | **≈9.5/10** |

## Đã hoàn thành (28/10/2026)

### Critical bugs
- [x] `useState(() => ...)` → `useEffect` — `/prediction` và `/history` không load dữ liệu khi vào trực tiếp
- [x] `npm test` chạy sai lệnh (`node --test` với file .ts) → `tsx --test`
- [x] Thêm `tsx ^4.23.15` vào devDependencies

### UI/UX — Flat Design 2.0
- [x] Design system mới: token-based CSS, 8px spacing grid, contrast ≥ 4.5:1
- [x] `NavBar` component với active state (`usePathname`), thay `<a>` bằng `next/link`
- [x] Skeleton loading cho mọi trang, spinner (sm/md), toast thông báo
- [x] Ball pop-in animation (stagger 60ms), stat bars trực quan cho số nóng/lạnh
- [x] Badge confidence (danger/warning/success theo ngưỡng)
- [x] Cards với border-top accent (đỏ = thống kê, tím = AI)
- [x] Accessibility: aria-label/aria-current/aria-busy, focus-visible, prefers-reduced-motion

### API & Code quality
- [x] `/api/sync` validate `type` — trả 400 rõ ràng thay vì im lặng
- [x] Trang About: sửa mô tả lỗi thời "dữ liệu mẫu" → đúng thực tế (scraper thật)
- [x] README: cập nhật hướng dẫn test + section UI/UX

## Kiểm chứng

```
npm test  →  15/15 pass
tsc       →  0 errors
build     →  12 routes compile sạch
lint      →  No ESLint warnings or errors
```

## Cập nhật 28/10 (vòng 2)

- **ESLint setup**: `eslint@8.57` + `eslint-config-next@14.2.35`, `.eslintrc.json`
  (extends `next/core-web-vitals`). Bỏ `--no-lint` khỏi build — giờ lint chạy
  trong `next build`. Thêm script `lint`. Kết quả: 0 warnings/errors.
- **CI workflow** `.github/workflows/ci.yml`: typecheck → lint → test → build
  trên Node 20, cache npm, trigger push/PR vào main. Không cần secrets lúc build
  (AI_API_KEY là optional — thiếu thì AI disabled).
- README: thêm badge CI + License.

## Cập nhật 28/10 (vòng 3) — rate limiting

- **`src/lib/rate-limit.ts`**: sliding-window in-memory limiter với:
  - `rateLimit(key, limit, windowMs)` — trả `{ok, remaining, retryAfter}`
  - `evictStale()` — dọn bucket cũ định kỳ tránh memory leak
  - `getClientIp(headers)` — x-forwarded-for (entry đầu, trim) → x-real-ip → "unknown"
  - `checkRateLimit(route, headers, limit, windowMs)` — helper cho API routes,
    trả `null` khi được phép / result khi bị chặn
  - Lưu ý TS: dùng `Map.forEach` thay `for...of` (target es5, tránh downlevelIteration)
- **Áp dụng**:
  - `POST /api/sync` — 5 req/phút/IP (mỗi lần kích hoạt scrape Vietlott) → 429 + Retry-After
  - `GET /api/ai-prediction` — 10 req/phút/IP (mỗi lần tốn chi phí AI) → 429 + Retry-After
- **`tests/rate-limit.test.ts`** (12 tests, node:test + `t.mock.timers`):
  sliding không fixed-window, retryAfter từ hit cũ nhất, per-key isolation,
  getClientIp contract, checkRateLimit null/object.
- Fix test mới: dùng relative import `../src/lib/rate-limit` (tsx --test không
  hiểu `@/` alias); `mock.timers` của node:test enable qua `t.mock.timers.enable({apis:["Date"]})`.

**Kết quả: 27/27 tests pass (15 + 12) · tsc 0 errors · lint sạch · build OK**

## Việc tiếp theo (backlog)

- [x] Bổ sung ESLint + Prettier, bỏ `--no-lint` khỏi build
- [x] CI workflow (GitHub Actions): test + typecheck + build + lint
- [x] Rate limiting cho API routes
- [ ] Integration test cho API routes (supertest hoặc node:test + fetch)
- [ ] Xử lý múi giờ draw_date đồng nhất (đang lưu ISO date, so sánh string)
- [ ] Đổi tên `getAIStatus()` → `getAIConfig()` (đặt tên đúng bản chất)

## Pháp lý

Chỉ cung cấp thông tin và thống kê tham khảo. Không khuyến khích cá cược. 18+.
