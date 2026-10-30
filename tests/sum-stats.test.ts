/**
 * Test cho calculateSumStats — phân tích tổng bộ số + chẵn/lẻ
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateSumStats } from "../src/lib/prediction";
import { DrawResult, LOTTERY_RULES } from "../src/types/lottery";

function makeDraw(
  drawNumber: string,
  drawDate: string,
  numbers: number[],
  lotteryType: DrawResult["lotteryType"] = "MEGA_645"
): DrawResult {
  return {
    id: 0,
    drawNumber,
    lotteryType,
    drawDate,
    numbers,
    jackpot: 0,
    published: true,
  };
}

describe("calculateSumStats", () => {
  test("tính đúng tổng, chẵn/lẻ cho từng kỳ", () => {
    const draws = [
      makeDraw("MXSH-00003", "2026-10-20", [2, 4, 6, 8, 10, 12]), // tổng 42, 6 chẵn
      makeDraw("MXSH-00002", "2026-10-15", [1, 3, 5, 7, 9, 11]), // tổng 36, 0 chẵn
      makeDraw("MXSH-00001", "2026-10-10", [1, 2, 3, 4, 5, 45]), // tổng 60, 2 chẵn
    ];
    const stats = calculateSumStats(draws, "MEGA_645", 50);

    // points: cũ nhất trước
    assert.equal(stats.points.length, 3);
    assert.equal(stats.points[0].drawNumber, "MXSH-00001");
    assert.equal(stats.points[2].sum, 42);

    const evenCounts = stats.points.map((p) => p.even);
    assert.deepEqual(evenCounts, [2, 0, 6]);
    assert.deepEqual(
      stats.points.map((p) => p.odd),
      [4, 6, 0]
    );
  });

  test("min/max/avg khớp dữ liệu", () => {
    const draws = [
      makeDraw("MXSH-00003", "2026-10-20", [2, 4, 6, 8, 10, 12]), // 42
      makeDraw("MXSH-00002", "2026-10-15", [1, 3, 5, 7, 9, 11]), // 36
      makeDraw("MXSH-00001", "2026-10-10", [1, 2, 3, 4, 5, 45]), // 60
    ];
    const stats = calculateSumStats(draws, "MEGA_645", 50);
    assert.equal(stats.min, 36);
    assert.equal(stats.max, 60);
    assert.equal(stats.avg, 46); // (42+36+60)/3 = 46
  });

  test("biên lý thuyết đúng cho Mega 6/45 (21–255) và Power 6/55 (21–315)", () => {
    const mega = calculateSumStats([], "MEGA_645", 50);
    assert.equal(mega.theoreticalMin, 21);
    assert.equal(mega.theoreticalMax, 255);

    const power = calculateSumStats([], "POWER_655", 50);
    assert.equal(power.theoreticalMin, 21);
    assert.equal(power.theoreticalMax, 315);
    // 50+51+52+53+54+55 = 315
  });

  test("cửa sổ window giới hạn số kỳ phân tích", () => {
    const draws = Array.from({ length: 80 }, (_, i) =>
      makeDraw(`MXSH-${String(100 + i).padStart(5, "0")}`, "2026-10-01", [1, 2, 3, 4, 5, 6])
    );
    const stats = calculateSumStats(draws, "MEGA_645", 50);
    assert.equal(stats.points.length, 50);
  });

  test("biên lý thuyết luôn ≥ min/max dữ liệu (không âm khi DB rỗng)", () => {
    const stats = calculateSumStats([], "MEGA_645", 50);
    assert.equal(stats.points.length, 0);
    assert.equal(stats.min, 21); // min = theoreticalMin khi không có dữ liệu
    assert.equal(stats.avg, 0);
  });

  test("Power 6/55 tính bonus riêng — numbers chỉ 6 số chính", () => {
    const draw = makeDraw(
      "PXSH-00001",
      "2026-10-20",
      [50, 51, 52, 53, 54, 55],
      "POWER_655"
    );
    const stats = calculateSumStats([draw], "POWER_655", 10);
    assert.equal(stats.points[0].sum, 315); // 50+51+52+53+54+55
    assert.equal(LOTTERY_RULES.POWER_655.pickCount, 6);
  });
});
