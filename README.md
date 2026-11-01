# Vietlott Prediction — Enterprise Edition

[![CI](https://github.com/nbhson/app-lottery-prediction/actions/workflows/ci.yml/badge.svg)](https://github.com/nbhson/app-lottery-prediction/actions/workflows/ci)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Ứng dụng web chuẩn enterprise: **tự động đồng bộ kết quả Vietlott THẬT** từ website chính thức, dự đoán kết hợp **thống kê + model AI** (cấu hình qua `.env`), **tự chấm điểm độ chính xác dự đoán** (accuracy tracking) và **audit chất lượng dữ liệu** (data quality audit).

⚠️ **Cảnh báo:** Dự đoán KHÔNG đảm bảo trúng. Xổ số là ngẫu nhiên hoàn toàn. 18+, chơi có trách nhiệm.

## Kiến trúc

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Next.js UI │────▶│  API Routes      │────▶│   SQLite    │
│  (React)    │     │  /api/sync       │     │  (SQLite)   │
└─────────────┘     │  /api/ai-pred.   │     └──────▲──────┘
                    └──────────────────┘            │
                          │                         │
                    ┌─────▼─────┐            ┌──────┴──────┐
                    │  Scraper  │            │ AI Client   │
                    │ vietlott.vn│           │ (.env cfg)  │
                    └───────────┘            └─────────────┘
```

- **Auto-sync:** `src/instrumentation.ts` bật scheduler khi server start (Next.js instrumentation hook) — sync ngay lúc khởi động + theo chu kỳ `DATA_SYNC_INTERVAL_MINUTES`. Khóa chống chạy song song 2 lớp: flag trong process + bản ghi `sync_log RUNNING` (an toàn khi chạy nhiều instance)
- **Backfill:** DB thiếu dữ liệu (< 120 kỳ) → tự động backfill: 1 request trang lịch sử (winning-number-645/655) + chuỗi request chi tiết từng kỳ qua ajaxpro (đã xác minh hoạt động) cho tới khi đủ dữ liệu cho thống kê/dự đoán
- **Data Ingestion:** scraper tự động từ `vietlott.vn` (English version — đã xác minh hoạt động), chống trùng lặp bằng `UNIQUE(draw_number, lottery_type)`
- **AI Module:** OpenAI-compatible API (OpenAI/OpenRouter/Groq/DeepSeek/Upstage/custom), cấu hình 100% qua `.env` — retry 429/5xx/timeout có backoff, parse JSON chịu được markdown fence, validate số trong phạm vi + supplement từ thống kê khi AI trả thiếu
- **Fallback an toàn:** AI lỗi/timeout/thiếu key → tự động trả kết quả thống kê, hiển thị trạng thái minh bạch
- **Accuracy Tracking:** mọi dự đoán được ghi `prediction_log`; kỳ mới sync xong → tự chấm điểm (số trúng) → thống kê avgMatches / baseline random / lift (trang `/prediction` + `GET /api/accuracy`)
- **Data Quality Audit:** kiểm tra read-only (trùng lặp, bộ số sai, đứt chuỗi draw ID) → status OK/WARN/DEGRADED, hiển thị trong `GET /api/health`
- **Health Check:** `GET /api/health` — DB liveness (503 khi chết) + quality audit + trạng thái sync/AI, sẵn sàng cắm monitoring/load balancer
- **Hiệu năng:** cache TTL 60s cho thống kê nặng (tần suất/cặp số/tổng bộ số), tự vô hiệu hóa khi sync chèn kỳ mới; các trang dữ liệu (trang chủ, lịch sử, thống kê, dự đoán) render server (SSR) — dữ liệu hiển thị ngay trong HTML đầu tiên
- **Rate limit 2 chế độ:** in-memory (mặc định, single instance) hoặc **Redis** khi set `REDIS_URL` — chia sẻ bucket qua nhiều instance, Lua script atomic, tự fallback in-memory khi Redis lỗi
- **Cảnh báo webhook:** sync/backfill fail liên tiếp (≥ 3 lần) hoặc dữ liệu stale quá ngưỡng → POST qua `NOTIFY_WEBHOOK_URL` (generic JSON hoặc Telegram sendMessage), cooldown 1 giờ chống spam — không cấu hình → no-op

## Deploy với Docker

```bash
docker build -t vietlott-prediction .
docker run -d --name vietlott \
  -p 3000:3000 \
  -v vietlott-data:/app/data \      # SQLite bền vững qua các lần chạy
  --env-file .env \                 # AI config + SYNC_API_TOKEN (tùy chọn)
  vietlott-prediction
```

- Multi-stage build trên `node:22-slim`, chạy user không đặc quyền, volume `/app/data`
- Build standalone chỉ bật khi `BUILD_STANDALONE=1` (Dockerfile tự set) — `npm start` cục bộ không bị ảnh hưởng
- Lưu ý: app cần IP Việt Nam để truy cập vietlott.vn — deploy server tại VN hoặc gắn proxy

## Tính năng

| Trang | Mô tả |
|---|---|
| `/` | Kết quả mới nhất (dữ liệu thật) + nút đồng bộ thủ công |
| `/history` | Lịch sử kết quả — SSR + phân trang qua URL (chia sẻ được link `?type=&page=`) |
| `/prediction` | Dự đoán thống kê (tần suất / gap / kết hợp) + **độ chính xác dự đoán** |
| `/prediction/ai` | Dự đoán AI + thống kê kết hợp, có số yêu thích |
| `/stats` | Thống kê nâng cao: tần suất đầy đủ, heatmap cặp số, xu hướng nóng/lạnh, tổng bộ số theo kỳ |
| `/about` | Cảnh báo rủi ro, điều khoản |

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/sync?type=MEGA_645` | Đồng bộ 1 loại hình từ vietlott.vn (yêu cầu `SYNC_API_TOKEN` nếu cấu hình) |
| `POST /api/sync` | Đồng bộ tất cả |
| `GET /api/sync` | Xem sync logs + cờ `syncApiProtected` |
| `GET /api/draws/latest?type=...` | Kết quả mới nhất |
| `GET /api/draws/history?type=&limit=&offset=` | Lịch sử có phân trang |
| `GET /api/ai-prediction?type=&favorites=3,14` | Dự đoán AI + thống kê |
| `GET /api/accuracy?type=` | **Độ chính xác dự đoán**: đã chấm, TB số trúng, baseline random, lift, phân phối |
| `GET /api/health` | **Health check**: DB, đếm records, data quality, trạng thái sync + AI (cho monitoring) |
| `GET /api/status` | Trạng thái nguồn + AI (không lộ API key) |

## Accuracy Tracking — tự chấm điểm dự đoán

Mỗi lần dự đoán (thống kê hoặc AI) được ghi vào bảng `prediction_log`. Khi kỳ
kết quả mới được đồng bộ, hệ thống **tự động chấm điểm** các dự đoán đang chờ:

- `avgMatches` — trung bình số trúng/kỳ của các dự đoán đã chấm
- `baseline` — kỳ vọng nếu chọn ngẫu nhiên hoàn toàn (6²/45 ≈ 0.8 cho Mega 6/45)
- `lift` — avgMatches / baseline. **Lift ≈ 1 nghĩa là phương pháp không nhỉnh hơn
  random** — trung thực với bản chất xác suất của xổ số, không tạo ảo giác.
- Retention tự động: chỉ giữ 5000 bản ghi mới nhất.

Chấm điểm chỉ áp dụng cho dự đoán được tạo TRƯỚC ngày của kỳ mới (invariant
`after_draw_date < draw_date`) — backfill các kỳ cũ không gây chấm nhầm.

## Data Quality Audit

`GET /api/health` chạy audit read-only cho từng loại hình:

- draw_number / draw_date trùng lặp
- Bộ số sai (sai số lượng, ngoài phạm vi 1-45/1-55, trùng nhau trong kỳ)
- Đứt chuỗi draw ID (dấu hiệu backfill thiếu kỳ)

Status: `OK` → `WARN` (đứt chuỗi) → `DEGRADED` (dữ liệu sai). Health endpoint
trả 503 khi DB không truy cập được — sẵn sàng cắm vào monitoring/load balancer.

## Bảo mật API sync

Đặt `SYNC_API_TOKEN` trong `.env` để bảo vệ `POST /api/sync`:

```env
SYNC_API_TOKEN=<chuỗi ngẫu nhiên dài>
```

Request phải kèm header `x-api-token: <token>` hoặc `Authorization: Bearer <token>`
(so sánh timing-safe, tránh timing attack). Kiểm tra auth chạy **trước** rate-limit —
kẻ lạ không thể đốt trần tổng. Chưa cấu hình token → sync mở (chỉ dùng cho dev).

## Yêu cầu

- **Node.js ≥ 20.9** (khuyến nghị **22 LTS** — requirement của Next.js 16)

## Cài đặt

```bash
npm install
cp .env.example .env   # cấu hình AI (tùy chọn) + data source + SYNC_API_TOKEN (khuyến nghị)
npm run dev            # → http://localhost:3000 (auto-sync + backfill tự chạy lúc start)
npm test               # 96 unit + integration tests (chạy qua tsx)
```

### Cấu hình `.env`

```env
# AI (tùy chọn — không có key thì dùng thuần thống kê)
AI_PROVIDER=openrouter        # openai | openrouter | groq | deepseek | custom
AI_API_KEY=sk-...
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=gpt-4o-mini

# Nguồn dữ liệu
DATA_SOURCE=vietlott_en       # vietlott.vn English (đã xác minh hoạt động)
DATA_SYNC_INTERVAL_MINUTES=30
FETCH_MAX_RETRIES=3

# Deployment (tùy chọn)
# DATA_DIR=/var/lib/vietlott  # thư mục SQLite, mặc định <project>/data
# TRUST_PROXY=1               # bật khi chạy sau reverse proxy đáng tin (nginx/Vercel)
# SYNC_API_TOKEN=<token>      # bảo vệ POST /api/sync khi deploy public
# REDIS_URL=redis://host:6379 # rate-limit multi-instance (bỏ trống → in-memory)

# Cảnh báo sync (15.5 — tùy chọn, bỏ trống → no-op)
# NOTIFY_WEBHOOK_URL=https://hooks.example.com/alert
#   hoặc Telegram: https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>
# NOTIFY_TELEGRAM_CHAT_ID=<chat_id>  # khi không nhúng chat_id vào URL
```

**Lưu ý:** Vietlott chặn IP ngoài Việt Nam — nếu chạy từ nước ngoài cần đặt server tại VN hoặc dùng proxy. Nguồn dữ liệu chính thức: `https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645` (đã xác minh trả dữ liệu thật). Lần chạy đầu app tự backfill ~120 kỳ/loại hình (~2-3 phút, chạy nền).

## Nguồn dữ liệu (không mock)

- **Primary:** `vietlott.vn/en` — website chính thức, trả về kết quả thật (Draw ID, Date, 6 số, Jackpot)
- Parser dựa trên class `bong_tron` (số kết quả) — có validation chặt (số lượng, phạm vi 1-45/1-55)
- Khi trang thay đổi cấu trúc → sync fail an toàn, ghi log, UI hiển thị trạng thái
- Chống trùng lặp: `INSERT OR IGNORE` + `UNIQUE(draw_number, lottery_type)`
- **Jackpot tích lũy:** chỉ trang kết quả mới nhất của vietlott.vn có giá trị jackpot
  (các kỳ backfill = 0) — mỗi chu kỳ sync, khi bắt lại kỳ đã có trong DB mà jackpot
  đang = 0, hệ thống tự cập nhật → jackpot tích lũy dần theo thời gian chạy app

## Dự đoán đa lớp

1. **Thống kê** (luôn có): tần suất + khoảng trống (gap — đo bằng số kỳ), miễn phí, tức thời
2. **AI** (qua `.env`): gửi ngữ cảnh (10 kỳ gần nhất + top số nóng/lạnh) cho model AI
3. **Fallback:** AI lỗi/timeout/thiếu key → trả thống kê, hiển thị rõ lý do

> **Độ tin cậy (confidence)** là chỉ số TƯƠNG ĐỐI phản ánh độ phủ dữ liệu (trần 45) —
> KHÔNG phải xác suất trúng. Mỗi kỳ quay là sự kiện ngẫu nhiên độc lập.

## Kiểm thử

```bash
npm test                                   # 96 unit + integration tests (tsx --test)
npm run lint                               # ESLint 9 (flat config — Next 16 đã xóa `next lint`)
npm run build                              # production build (Turbopack)

# AI smoke test — gọi provider AI THẬT end-to-end (DB thật → AI → parse → validate):
set -a; source .env; set +a; npx tsx scripts/ai-smoke.ts [MEGA_645|POWER_655]
```

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **SQLite** (better-sqlite3 v13) — WAL mode
- **ESLint 10** — flat config `eslint.config.mjs`
- **TypeScript 5.9** (TS 7 native tạm chờ hệ sinh thái typescript-eslint hỗ trợ)
- Node.js ≥ 20.9 (khuyến nghị 22)

## UI/UX

- **Design system:** Flat Design 2.0 — màu phẳng, micro-shadow, contrast ≥ 4.5:1, lưới 8px
- **Trạng thái ứng dụng:** skeleton loading, spinner, toast thông báo, trạng thái lỗi có nút thử lại
- **Trợ năng:** focus ring hiển thị, `prefers-reduced-motion` được tôn trọng, aria-label/aria-current đầy đủ

## Pháp lý

Chỉ cung cấp thông tin và thống kê tham khảo. Không khuyến khích cá cược. 18+.
