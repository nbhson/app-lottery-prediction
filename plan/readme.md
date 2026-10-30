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

## Cập nhật 28/10 (vòng 4) — múi giờ draw_date + dedupe formatDate

**Audit múi giờ `draw_date`** — kết quả: kiến trúc đã ĐÚNG, chỉ cần chốt invariant:
- DB lưu `draw_date TEXT` dạng date-only `YYYY-MM-DD` (scraper parse từ
  `DD/MM/YYYY` của vietlott.vn) — không mang giờ, không lệch timezone khi lưu
- So sánh trong `sync.ts` dùng string compare `>=` — đúng với ISO date
- `calculateGap` dùng `new Date(dateStr)` 2 đầu cùng UTC midnight — chênh lệch
  ngày chính xác, không bị DST
- Hiển thị: `formatDate` pin `timeZone: "Asia/Ho_Chi_Minh"` — `00:00 UTC` =
  `07:00` cùng ngày ở VN, nên ngày render luôn trùng ngày trong DB

**Fix thực hiện:**
- `src/lib/format.ts` (mới): `formatDate` + `formatVnd` dùng chung, kèm doc
  giải thích invariant UTC-midnight → +7
- Bỏ 2 bản `formatDate`/`formatMoney` duplicate trong `page.tsx`,
  `history/page.tsx` → import từ lib
- `types/lottery.ts`: sửa comment sai "múi giờ VN (UTC+7)" → đúng bản chất
  date-only
- `tests/format.test.ts` (5 tests): ngày biên tháng, invariant không lệch ±1
  ngày, formatVnd 0 → "—"

**Kết quả: 32/32 tests pass · tsc 0 errors · lint sạch · build OK**

## Cập nhật 28/10 (vòng 5) — integration test API routes + fix bug 400/500

**Bug thật tìm ra qua integration test:** 3 route (`draws/latest`,
`draws/history`, `prediction`, `ai-prediction`) cast `type` thẳng
`as LotteryType` rồi truy cập `LOTTERY_RULES[type].nameVi` → query
`?type=INVALID` gây **TypeError → 500** thay vì 400.

**Fix:**
- `src/lib/validate.ts` (mới): `parseLotteryTypeParam()` — trả type hợp lệ
  (default MEGA_645) hoặc null → route trả 400 rõ ràng
- 4 routes validate trước khi đụng DB/AI

**Integration tests** `tests/api-routes.test.ts` (10 tests) — gọi route
handlers TRỰC TIẾP với `NextRequest` thật (không cần server):
- `/api/status` → 200, không leak API key (regex scan toàn response)
- `/api/draws/latest`: 200 + meta shape; type rỗng → default; INVALID → 400
- `/api/draws/history`: 200 + phân trang hasMore; INVALID → 400
- `/api/prediction`: INVALID → 400; method lạ → không 500
- `/api/ai-prediction`: INVALID → 400
- `POST /api/sync`: type INVALID → 400 (trước rate-limit check, không scrape)

**Kết quả: 42/42 tests pass (15 + 12 + 5 + 10) · tsc 0 · lint sạch · build OK**

## Cập nhật 30/10/2026 (vòng 6) — nâng cấp nghiệp vụ enterprise

**Fix bugs từ audit code:**
- `sync.ts`: xóa dòng `insertDrawsMany(history.draws)` gọi 2 lần (vô hại do
  `INSERT OR IGNORE` nhưng thừa, sai ý đồ)
- `vietlott-en-scraper.ts`: xóa dead code `scrapeFromPage()` (duplicate logic
  của `scrapeLatest`)
- `prediction.ts`: thêm tie-break theo số tăng dần cho cả 3 phương pháp dự đoán
  → kết quả deterministic khi tần suất/gap/điểm bằng nhau
- Thêm file `LICENSE` (MIT) — README badge đã trỏ tới từ trước nhưng thiếu file

**Accuracy Tracking — tự chấm điểm dự đoán (nghiệp vụ mới):**
- Bảng `prediction_log` mới trong SQLite: ghi mỗi lần dự đoán (method, numbers,
  confidence, mốc `after_draw_number/date`)
- `src/lib/accuracy.ts`: `countMatches` (khử trùng lặp), `randomBaseline`
  (pickCount²/totalNumbers), `gradePredictionsForNewDraw` (chấm tự động khi kỳ
  mới được sync — invariant `after_draw_date < draw_date` để backfill không
  chấm nhầm), `getAccuracyStats` (SQL aggregate: avgMatches, baseline, lift,
  phân phối, best)
- Sync gọi chấm điểm sau khi chèn kỳ mới thành công; retention giữ 5000 rows
- `GET /api/accuracy?type=` + section "Độ chính xác dự đoán" trên trang /prediction
- Triết lý trung thực: lift ≈ 1 → không nhỉnh hơn random, hiển thị rõ cho người dùng

**Bảo mật API sync:**
- `SYNC_API_TOKEN` (.env) bảo vệ `POST /api/sync`: header `x-api-token` hoặc
  `Authorization: Bearer`, so sánh `crypto.timingSafeEqual`
- Auth chạy TRƯỚC rate-limit — kẻ lạ không đốt được trần tổng
- `/api/status` + `GET /api/sync` thêm cờ `syncApiProtected`

**Health & Data Quality:**
- `src/lib/data-quality.ts` (mới): audit read-only — draw_number/date trùng,
  bộ số sai, đứt chuỗi draw ID (vd kỳ MXSH-00500 thiếu giữa chuỗi) → status
  OK/WARN/DEGRADED
- `GET /api/health` (mới): DB liveness (503 khi chết), draw counts, quality
  audit, sync status, AI enabled — sẵn sàng cho monitoring/load balancer

**Kiểm chứng:**

```
npm test  →  66/66 pass (thêm 16 tests: accuracy pure + health + auth + accuracy API)
tsc       →  0 errors
lint      →  No ESLint warnings or errors
build     →  16 routes compile sạch (thêm /api/accuracy, /api/health)
```

## Cập nhật 30/10/2026 (vòng 7) — nâng cấp Next.js 14 → 16, vá toàn bộ lỗ hổng

**Động cơ:** `npm audit` báo 5 lỗ hổng (1 critical Next.js — DoS Image Optimizer,
request smuggling rewrites, RSC deserialization; 4 high postcss/glob). Các advisory
ảnh hưởng cả dải tới 16.3-preview → không có bản vá trong nhánh 14, phải nâng cấp major.

**Thay đổi:**
- `next` ^14.2 → **^16.4.3**, `react`/`react-dom` ^18.3 → **^19.3.1** (bắt buộc Next 15+)
- `@types/react(-dom)` → ^19; `eslint` ^8.57 → **^9.39**, `eslint-config-next` → ^16.4.3
- **Next 16 xóa `next lint`** → ESLint 9 flat config `eslint.config.mjs`
  (eslint-config-next 16 export flat config gốc — không cần FlatCompat), script
  `lint` = `eslint .`; xóa `.eslintrc.json`
- **Turbopack mặc định cho dev + build** → `next.config.mjs` bỏ hẳn webpack config:
  - `experimental.serverComponentsExternalPackages` → `serverExternalPackages` (stable Next 15)
  - alias `@` đọc tự động từ `tsconfig.json paths` — không cần webpack alias
- ESLint 9 / react-hooks mới bắt 12 issue: sửa tận gốc `<a href="/">` → `<Link>`
  (history, stats), xóa 4 disable directive `exhaustive-deps` thừa, fix 8 lỗi
  `react-hooks/set-state-in-effect` bằng `queueMicrotask()` (tránh cascading
  render khi fetch-on-mount)
- CI: Node 20 (đã EOL) → 22

**Kiểm chứng:**

```
npm audit → 0 vulnerabilities (từ 5: 1 critical + 4 high)
npm test  →  66/66 pass
tsc       →  0 errors
eslint .  →  0 errors, 0 warnings
build     →  17 routes (Turbopack) — 1 warning vô hại về process.once trong
             instrumentation.ts (đã guard NEXT_RUNTIME=nodejs, chỉ runtime Node chạy)
```

## Trạng thái: ✅ BACKLOG ĐÃ XỬ LÝ HẾT — chuyển sang chế độ bảo trì

## Việc tiếp theo (backlog)

- [x] Bổ sung ESLint + Prettier, bỏ `--no-lint` khỏi build
- [x] CI workflow (GitHub Actions): test + typecheck + build + lint
- [x] Rate limiting cho API routes
- [x] Integration test cho API routes (supertest hoặc node:test + fetch)
- [x] Xử lý múi giờ draw_date đồng nhất (đang lưu ISO date, so sánh string)
- [x] Đổi tên `getAIStatus()` → `getAIConfig()` (đặt tên đúng bản chất)

## Pháp lý

Chỉ cung cấp thông tin và thống kê tham khảo. Không khuyến khích cá cược. 18+.
