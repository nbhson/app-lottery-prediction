/**
 * Unit tests cho accuracy tracking — pure functions (không đụng DB):
 * - countMatches: đếm số trúng, khử trùng lặp
 * - randomBaseline: pickCount² / totalNumbers
 * - extractDrawSeq + findSequenceGaps (từ data-quality)
 * Chạy: npx tsx --test tests/accuracy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countMatches, randomBaseline } from "../src/lib/accuracy";
import {
  extractDrawSeq,
  findSequenceGaps,
} from "../src/lib/data-quality";

describe("countMatches", () => {
  it("đếm đúng số trúng giữa dự đoán và kết quả", () => {
    assert.equal(countMatches([1, 2, 3, 4, 5, 6], [4, 5, 6, 7, 8, 9]), 3);
    assert.equal(countMatches([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]), 6);
    assert.equal(countMatches([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]), 0);
  });

  it("khử trùng lặp — số trùng trong 1 bộ chỉ đếm 1 lần", () => {
    // predicted có 2 số 5, kết quả có 1 số 5 → chỉ 1 match
    assert.equal(countMatches([5, 5, 6, 7, 8, 9], [5, 6, 10, 11, 12, 13]), 2);
    // actual trùng lặp cũng vậy
    assert.equal(countMatches([5, 6], [5, 5, 6, 6]), 2);
  });

  it("bộ rỗng → 0 match", () => {
    assert.equal(countMatches([], [1, 2, 3]), 0);
    assert.equal(countMatches([1, 2, 3], []), 0);
  });
});

describe("randomBaseline", () => {
  it("Mega 6/45: 6×6/45 ≈ 0.8", () => {
    assert.equal(randomBaseline("MEGA_645"), Math.round((36 / 45) * 100) / 100);
  });

  it("Power 6/55: 6×6/55 ≈ 0.65", () => {
    const b = randomBaseline("POWER_655");
    assert.ok(b > 0.6 && b < 0.7, `baseline Power phải ≈0.65, nhận ${b}`);
  });
});

describe("extractDrawSeq", () => {
  it("tách phần số cuối của drawNumber", () => {
    assert.equal(extractDrawSeq("MXSH-01580"), 1580);
    assert.equal(extractDrawSeq("PXSH-01001"), 1001);
    assert.equal(extractDrawSeq("MXSH-99"), 99);
  });

  it("format lạ → null", () => {
    assert.equal(extractDrawSeq("không-có-số"), null);
  });
});

describe("findSequenceGaps", () => {
  it("phát hiện kỳ thiếu giữa chuỗi liên tiếp", () => {
    const draws = [
      { drawNumber: "MXSH-0001", seq: 1 },
      { drawNumber: "MXSH-0002", seq: 2 },
      { drawNumber: "MXSH-0004", seq: 4 }, // thiếu 0003
      { drawNumber: "MXSH-0005", seq: 5 },
    ];
    const gaps = findSequenceGaps(draws);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0], "MXSH-0002"); // kỳ TRƯỚC chỗ đứt
  });

  it("chuỗi liên tiếp → không có gap", () => {
    const draws = [
      { drawNumber: "MXSH-0001", seq: 1 },
      { drawNumber: "MXSH-0002", seq: 2 },
      { drawNumber: "MXSH-0003", seq: 3 },
    ];
    assert.equal(findSequenceGaps(draws).length, 0);
  });

  it("giới hạn 10 ví dụ gap", () => {
    const draws: Array<{ drawNumber: string; seq: number }> = [];
    for (let i = 1; i <= 40; i += 2) {
      draws.push({ drawNumber: `MXSH-${String(i).padStart(5, "0")}`, seq: i });
    }
    assert.equal(findSequenceGaps(draws).length, 10);
  });
});
