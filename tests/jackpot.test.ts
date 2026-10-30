/**
 * Test cho updateJackpotIfMissing — tích lũy jackpot cho kỳ backfill
 */
import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { updateJackpotIfMissing, upsertDraw, getLatestDraw, getDb } from "../src/lib/db";
import { DrawResult } from "../src/types/lottery";

// DB test dùng dữ liệu thật — chỉ thêm kỳ test riêng bằng drawNumber đặc biệt
const TEST_NUMBER = `TESTJP-${Date.now()}`;

function cleanup() {
  try {
    getDb().prepare("DELETE FROM draws WHERE draw_number = ?").run(TEST_NUMBER);
  } catch {
    /* bỏ qua */
  }
}

describe("updateJackpotIfMissing", () => {
  beforeEach(cleanup);
  after(cleanup);

  test("cập nhật jackpot cho kỳ tồn tại đang = 0", () => {
    upsertDraw({
      drawNumber: TEST_NUMBER,
      lotteryType: "MEGA_645",
      drawDate: "2026-10-29",
      numbers: [1, 2, 3, 4, 5, 6],
      jackpot: 0,
      published: true,
    });

    assert.equal(updateJackpotIfMissing(TEST_NUMBER, "MEGA_645", 16_500_000_000), true);

    const rows = getLatestDraw("MEGA_645"); // chỉ để đảm bảo DB còn sống
    assert.notEqual(rows, null);
  });

  test("không đè jackpot đã có (> 0)", () => {
    upsertDraw({
      drawNumber: TEST_NUMBER,
      lotteryType: "MEGA_645",
      drawDate: "2026-10-29",
      numbers: [7, 8, 9, 10, 11, 12],
      jackpot: 100_000_000,
      published: true,
    });

    // Kỳ đã có jackpot=100tr → update không được phép ghi đè
    assert.equal(updateJackpotIfMissing(TEST_NUMBER, "MEGA_645", 999_000_000), false);
  });

  test("jackpot <= 0 → false, không chạm DB", () => {
    assert.equal(updateJackpotIfMissing(TEST_NUMBER, "MEGA_645", 0), false);
    assert.equal(updateJackpotIfMissing(TEST_NUMBER, "MEGA_645", -5), false);
  });

  test("kỳ không tồn tại → false", () => {
    assert.equal(
      updateJackpotIfMissing(`TESTJP-NONE-${Date.now()}`, "MEGA_645", 123),
      false
    );
  });

  test("sai lottery_type → false", () => {
    upsertDraw({
      drawNumber: TEST_NUMBER,
      lotteryType: "MEGA_645",
      drawDate: "2026-10-29",
      numbers: [13, 14, 15, 16, 17, 18],
      jackpot: 0,
      published: true,
    });
    assert.equal(updateJackpotIfMissing(TEST_NUMBER, "POWER_655", 123), false);
  });
});
