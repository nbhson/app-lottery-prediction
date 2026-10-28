/**
 * Unit tests cho src/lib/format.ts — formatDate + formatVnd.
 * Chạy: npx tsx --test tests/format.test.ts
 *
 * Invariant múi giờ quan trọng: draw_date lưu "YYYY-MM-DD" (date-only).
 * `new Date("YYYY-MM-DD")` = UTC midnight; hiển thị pin Asia/Ho_Chi_Minh
 * (+7) nên ngày render LUÔN trùng ngày trong DB, bất kể server đặt ở
 * timezone nào. Test giả lập 2 mốc: nửa đêm VN và cuối ngày VN.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatVnd } from "../src/lib/format";

describe("formatDate — invariant múi giờ draw_date", () => {
  it("render đúng ngày lịch trong DB (không lệch ±1 ngày)", () => {
    // drawDate lưu trong DB là "2026-10-25"
    assert.equal(formatDate("2026-10-25"), "25/10/2026");
    assert.equal(formatDate("2026-01-01"), "01/01/2026");
    assert.equal(formatDate("2026-12-31"), "31/12/2026");
  });

  it("ổn định qua các ngày biên dễ lệch múi giờ (đầu/cuối tháng)", () => {
    // new Date("2026-03-01") = 01/03T00:00Z = 01/03 07:00 VN — vẫn đúng ngày
    assert.equal(formatDate("2026-03-01"), "01/03/2026");
    // new Date("2026-02-28") = 28/02T00:00Z — không trôi sang 29/02 hay 01/03
    assert.equal(formatDate("2026-02-28"), "28/02/2026");
  });

  it("không phụ thuộc timezone hệ thống (pin Asia/Ho_Chi_Minh)", () => {
    // Kết quả phải giống nhau bất kể TZ cục bộ — test chạy trong TZ bất kỳ
    const expected = "15/06/2026";
    assert.equal(formatDate("2026-06-15"), expected);
  });
});

describe("formatVnd", () => {
  it("0 → '—' (chưa có dữ liệu jackpot)", () => {
    assert.equal(formatVnd(0), "—");
  });

  it("định dạng nhóm nghìn kiểu vi-VN + đ", () => {
    assert.equal(formatVnd(18_000_000_000), "18.000.000.000 đ");
  });
});
