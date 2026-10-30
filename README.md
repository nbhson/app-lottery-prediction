# Vietlott Prediction — Enterprise Edition

[![CI](https://github.com/nguyenson/app-lottery-prediction/actions/workflows/ci.yml/badge.svg)](https://github.com/nguyenson/app-lottery-prediction/actions/workflows/ci)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Ứng dụng web chuẩn enterprise: **tự động đồng bộ kết quả Vietlott THẬT** từ website chính thức, dự đoán kết hợp **thống kê + model AI** (cấu hình qua `.env`).

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
- **AI Module:** OpenAI-compatible API (OpenAI/OpenRouter/Groq/DeepSeek/custom), cấu hình 100% qua `.env`
- **Fallback an toàn:** AI lỗi/timeout/thiếu key → tự động trả kết quả thống kê, hiển thị trạng thái minh bạch

## Tính năng

| Trang | Mô tả |
|---|---|
| `/` | Kết quả mới nhất (dữ liệu thật) + nút đồng bộ thủ công |
| `/history` | Lịch sử kết quả, phân trang |
| `/prediction` | Dự đoán thống kê (tần suất / gap / kết hợp) |
| `/prediction/ai` | Dự đoán AI + thống kê kết hợp, có số yêu thích |
| `/about` | Cảnh báo rủi ro, điều khoản |

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/sync?type=MEGA_645` | Đồng bộ 1 loại hình từ vietlott.vn |
| `POST /api/sync` | Đồng bộ tất cả |
| `GET /api/sync` | Xem sync logs |
| `GET /api/draws/latest?type=...` | Kết quả mới nhất |
| `GET /api/draws/history?type=&limit=&offset=` | Lịch sử có phân trang |
| `GET /api/ai-prediction?type=&favorites=3,14` | Dự đoán AI + thống kê |
| `GET /api/status` | Trạng thái nguồn + AI (không lộ API key) |

## Cài đặt

```bash
npm install
cp .env.example .env   # cấu hình AI (tùy chọn) + data source
npm run dev            # → http://localhost:3000 (auto-sync + backfill tự chạy lúc start)
npm test               # 50 unit + integration tests (chạy qua tsx)
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
```

**Lưu ý:** Vietlott chặn IP ngoài Việt Nam — nếu chạy từ nước ngoài cần đặt server tại VN hoặc dùng proxy. Nguồn dữ liệu chính thức: `https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645` (đã xác minh trả dữ liệu thật). Lần chạy đầu app tự backfill ~120 kỳ/loại hình (~2-3 phút, chạy nền).

## Nguồn dữ liệu (không mock)

- **Primary:** `vietlott.vn/en` — website chính thức, trả về kết quả thật (Draw ID, Date, 6 số, Jackpot)
- Parser dựa trên class `bong_tron` (số kết quả) — có validation chặt (số lượng, phạm vi 1-45/1-55)
- Khi trang thay đổi cấu trúc → sync fail an toàn, ghi log, UI hiển thị trạng thái
- Chống trùng lặp: `INSERT OR IGNORE` + `UNIQUE(draw_number, lottery_type)`

## Dự đoán đa lớp

1. **Thống kê** (luôn có): tần suất + khoảng trống (gap — đo bằng số kỳ), miễn phí, tức thời
2. **AI** (qua `.env`): gửi ngữ cảnh (10 kỳ gần nhất + top số nóng/lạnh) cho model AI
3. **Fallback:** AI lỗi/timeout/thiếu key → trả thống kê, hiển thị rõ lý do

> **Độ tin cậy (confidence)** là chỉ số TƯƠNG ĐỐI phản ánh độ phủ dữ liệu (trần 45) —
> KHÔNG phải xác suất trúng. Mỗi kỳ quay là sự kiện ngẫu nhiên độc lập.

## Kiểm thử

```bash
npm test                                   # 50 unit + integration tests (tsx --test)
npm run build                              # production build
```

## UI/UX

- **Design system:** Flat Design 2.0 — màu phẳng, micro-shadow, contrast ≥ 4.5:1, lưới 8px
- **Trạng thái ứng dụng:** skeleton loading, spinner, toast thông báo, trạng thái lỗi có nút thử lại
- **Trợ năng:** focus ring hiển thị, `prefers-reduced-motion` được tôn trọng, aria-label/aria-current đầy đủ

## Pháp lý

Chỉ cung cấp thông tin và thống kê tham khảo. Không khuyến khích cá cược. 18+.
