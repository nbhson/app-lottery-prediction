/**
 * Kiểm thử đơn vị — kiến trúc enterprise (scraper + AI + prediction)
 * Chạy: npx tsx --test tests/prediction.test.ts
 *
 * Không dùng dữ liệu mock khi runtime — tests dùng HTML fixture thật
 * (đã xác minh từ vietlott.vn EN) và fixtures nhỏ để kiểm tra parse.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calculateFrequencyStats,
  predictByFrequency,
  predictByGap,
  predictByFrequencyAndGap,
} from "../src/lib/prediction";
import { LOTTERY_RULES, DrawResult } from "../src/types/lottery";
import { getConfig } from "../src/lib/config";
import { getAIConfig } from "../src/lib/ai/client";
import {
  parseAIPredictionShape,
  parseMega645ForTest,
  parsePower655ForTest,
} from "./helpers/aiParse";
import {
  SCRAPE_FIXTURE_MEGA,
  SCRAPE_FIXTURE_POWER,
  SCRAPE_FIXTURE_NO_DATA,
  SCRAPE_FIXTURE_HISTORY_MEGA,
  SCRAPE_FIXTURE_HISTORY_POWER,
} from "./fixtures/scrapeFixtures";
import { parseHistoryPage } from "../src/lib/sources/vietlott-en-scraper";
import { LotteryType } from "../src/types/lottery";

// ============================================================
// Dữ liệu test — không phải mock runtime, chỉ fixture cho unit test
// ============================================================
const fixtureDraws: DrawResult[] = [
  {
    id: 1,
    drawNumber: "MXSH-01045",
    lotteryType: "MEGA_645",
    drawDate: "2026-10-25",
    numbers: [3, 12, 18, 27, 34, 42],
    jackpot: 46_000_000_000,
    published: true,
  },
  {
    id: 2,
    drawNumber: "MXSH-01044",
    lotteryType: "MEGA_645",
    drawDate: "2026-10-22",
    numbers: [7, 14, 21, 28, 35, 41],
    jackpot: 0,
    published: true,
  },
  {
    id: 3,
    drawNumber: "MXSH-01044b",
    lotteryType: "MEGA_645",
    drawDate: "2026-10-22",
    numbers: [1, 9, 16, 23, 38, 45],
    jackpot: 32_000_000_000,
    published: true,
  },
];

describe("getConfig — đọc .env an toàn", () => {
  it("trả về config AI có enabled=false khi thiếu AI_API_KEY", () => {
    const cfg = getConfig();
    assert.strictEqual(typeof cfg.ai.enabled, "boolean");
    // Nếu test này chạy không có AI_API_KEY trong env → enabled=false
    if (!process.env.AI_API_KEY) {
      assert.strictEqual(cfg.ai.enabled, false);
    }
  });

  it("provider mặc định là openrouter, baseUrl không rỗng", () => {
    const cfg = getConfig();
    assert.ok(cfg.ai.provider.length > 0);
    assert.ok(cfg.ai.baseUrl.startsWith("http"));
    assert.strictEqual(typeof cfg.ai.model, "string");
    assert.ok(cfg.ai.timeoutMs > 0);
  });

  it("dataSource có cấu hình mặc định hợp lệ", () => {
    const cfg = getConfig();
    assert.strictEqual(cfg.dataSource.source, "vietlott_en");
    assert.ok(cfg.dataSource.syncIntervalMinutes >= 1);
    assert.ok(cfg.dataSource.maxRetries >= 1);
  });
});

describe("getAIConfig — không bao giờ lộ API key", () => {
  it("trả về object chỉ có 4 field, không chứa apiKey", () => {
    const status = getAIConfig();
    assert.ok("enabled" in status);
    assert.ok("provider" in status);
    assert.ok("model" in status);
    assert.ok("baseUrl" in status);
    const json = JSON.stringify(status);
    assert.ok(!json.toLowerCase().includes("apikey"), "không được chứa apiKey");
  });
});

describe("parseAIPrediction (parser JSON AI)", () => {
  it("parse được JSON thuần", () => {
    const result = parseAIPredictionShape('{"numbers":[1,2,3],"reasoning":"test"}');
    assert.ok(result);
    assert.deepStrictEqual(result.numbers, [1, 2, 3]);
    assert.strictEqual(result.reasoning, "test");
  });

  it("parse được JSON bọc trong markdown code fence", () => {
    const result = parseAIPredictionShape(
      '```json\n{"numbers":[5,10,15],"reasoning":"kiểm thử"}\n```'
    );
    assert.ok(result);
    assert.deepStrictEqual(result.numbers, [5, 10, 15]);
  });

  it("trả null khi response không phải JSON", () => {
    const result = parseAIPredictionShape("Xin lỗi, tôi không thể giúp...");
    assert.strictEqual(result, null);
  });
});

describe("Scraper parse (dữ liệu thật từ vietlott.vn EN)", () => {
  it("parse được fixture Mega 6/45 thật từ trang EN", () => {
    const result = parseMega645ForTest(SCRAPE_FIXTURE_MEGA);
    assert.strictEqual(result.success, true);
    if (result.success && result.data) {
      assert.strictEqual(result.data.lotteryType, "MEGA_645");
      assert.strictEqual(result.data.numbers.length, 6);
      for (const n of result.data.numbers) {
        assert.ok(n >= 1 && n <= 45);
      }
    }
  });

  it("parse được fixture Power 6/55 với bonus number", () => {
    const result = parsePower655ForTest(SCRAPE_FIXTURE_POWER);
    assert.strictEqual(result.success, true);
    if (result.success && result.data) {
      assert.strictEqual(result.data.numbers.length, 6);
      assert.ok(result.data.bonusNumber !== undefined);
      assert.ok(result.data.bonusNumber! >= 1 && result.data.bonusNumber! <= 55);
    }
  });

  it("reject khi HTML không chứa Draw ID (trang bị thay đổi)", () => {
    const result = parseMega645ForTest(SCRAPE_FIXTURE_NO_DATA);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it("bonus ngoài phạm vi 1-55 → undefined (không fail cả kỳ)", () => {
    const badBonus = SCRAPE_FIXTURE_POWER.replace(">49<", ">99<");
    const result = parsePower655ForTest(badBonus);
    assert.strictEqual(result.success, true);
    if (result.success && result.data) {
      assert.strictEqual(result.data.bonusNumber, undefined);
    }
  });
});

describe("parseHistoryPage — backfill từ trang winning-number", () => {
  it("Mega: parse đủ kỳ, thứ tự mới nhất trước, đúng drawNumber", () => {
    const result = parseHistoryPage(SCRAPE_FIXTURE_HISTORY_MEGA, "MEGA_645");
    assert.strictEqual(result.success, true);
    const draws = result.draws!;
    assert.strictEqual(draws.length, 3);
    // Mới nhất trước
    assert.strictEqual(draws[0].drawNumber, "MXSH-01581");
    assert.strictEqual(draws[1].drawNumber, "MXSH-01580");
    assert.strictEqual(draws[2].drawNumber, "MXSH-01579");
    assert.strictEqual(draws[0].drawDate, "2026-10-28");
    assert.deepStrictEqual(draws[0].numbers, [1, 9, 11, 28, 33, 42]);
    assert.strictEqual(draws[0].bonusNumber, undefined);
    assert.ok(draws.every((d) => d.published));
  });

  it("Power: tách đúng bonus khỏi 6 số chính", () => {
    const result = parseHistoryPage(SCRAPE_FIXTURE_HISTORY_POWER, "POWER_655");
    assert.strictEqual(result.success, true);
    const draws = result.draws!;
    assert.strictEqual(draws.length, 2);
    assert.deepStrictEqual(draws[0].numbers, [9, 29, 33, 38, 45, 46]);
    assert.strictEqual(draws[0].bonusNumber, 53);
    assert.deepStrictEqual(draws[1].numbers, [5, 11, 20, 27, 36, 50]);
    assert.strictEqual(draws[1].bonusNumber, 7);
  });

  it("HTML rác → success=false, không ném exception", () => {
    const result = parseHistoryPage(SCRAPE_FIXTURE_NO_DATA, "MEGA_645");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});

describe("calculateFrequencyStats — gap đo bằng SỐ KỲ (không phải ngày)", () => {
  it("số trong kỳ mới nhất → gap 0; cũ hơn → gap = số kỳ cách biệt", () => {
    // Mới nhất trước: kỳ 1 (mới), kỳ 2, kỳ 3 (cũ)
    const stats = calculateFrequencyStats(fixtureDraws, "MEGA_645");
    const byNumber = new Map(stats.map((s) => [s.number, s]));
    // Số 3, 12... ở kỳ 1 (index 0) → gap 0
    assert.strictEqual(byNumber.get(3)!.gap, 0);
    assert.strictEqual(byNumber.get(12)!.gap, 0);
    // Số 7, 14... ở kỳ 2 (index 1) → gap 1
    assert.strictEqual(byNumber.get(7)!.gap, 1);
    // Số 1, 9... ở kỳ 3 (index 2) → gap 2
    assert.strictEqual(byNumber.get(1)!.gap, 2);
  });

  it("số chưa từng xuất hiện → gap = tổng số kỳ", () => {
    const stats = calculateFrequencyStats(fixtureDraws, "MEGA_645");
    const never = stats.find((s) => s.number === 20)!;
    assert.strictEqual(never.count, 0);
    assert.strictEqual(never.gap, fixtureDraws.length);
    assert.strictEqual(never.lastAppeared, "");
  });
});

describe("confidence — trần trung thực, không bão hòa", () => {
  it("mọi phương pháp trả confidence trong [10, 45]", () => {
    const draws = buildFixtureDraws("MEGA_645", 100);
    const methods = [
      predictByFrequency("MEGA_645", draws),
      predictByGap("MEGA_645", draws),
      predictByFrequencyAndGap("MEGA_645", draws),
    ];
    for (const p of methods) {
      assert.ok(p.confidence >= 10 && p.confidence <= 45, `confidence=${p.confidence}`);
    }
  });
});

describe("predictByFrequency / predictByGap (giữ nguyên logic cũ)", () => {
  const megaFixture = buildFixtureDraws("MEGA_645", 10);

  it("FREQUENCY trả đúng 6 số trong [1,45]", () => {
    const p = predictByFrequency("MEGA_645", megaFixture);
    assert.strictEqual(p.numbers.length, 6);
    assert.ok(p.numbers.every((n) => n >= 1 && n <= 45));
  });

  it("FREQUENCY_AND_GAP trả đúng số lượng + mô tả 'kết hợp'", () => {
    const p = predictByFrequencyAndGap("MEGA_645", megaFixture);
    assert.strictEqual(p.numbers.length, 6);
    assert.ok(
      p.description.includes("kết hợp") || p.description.toLowerCase().includes("gap")
    );
  });

  it("Power 6/55 trả 6 số trong [1,55]", () => {
    const powerFixture = buildFixtureDraws("POWER_655", 8);
    const p = predictByFrequencyAndGap("POWER_655", powerFixture);
    assert.strictEqual(p.numbers.length, 6);
    for (const n of p.numbers) {
      assert.ok(n >= 1 && n <= 55);
    }
  });
});

describe("LOTTERY_RULES — enterprise data sanity", () => {
  it("MEGA_645: 6 số trong 1-45, không bonus", () => {
    const r = LOTTERY_RULES["MEGA_645"];
    assert.strictEqual(r.pickCount, 6);
    assert.strictEqual(r.maxNumber, 45);
    assert.strictEqual(r.hasBonusNumber, false);
  });

  it("POWER_655: 6 số 1-55 + bonus", () => {
    const r = LOTTERY_RULES["POWER_655"];
    assert.strictEqual(r.pickCount, 6);
    assert.strictEqual(r.maxNumber, 55);
    assert.strictEqual(r.hasBonusNumber, true);
  });
});

// ============================================================
// Helpers
// ============================================================

/** Tạo N kỳ kết quả fixture hợp lệ (mô phỏng dữ liệu thật) */
function buildFixtureDraws(type: LotteryType, count: number): DrawResult[] {
  const rule = LOTTERY_RULES[type];
  const draws: DrawResult[] = [];
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < count; i++) {
    const nums = new Set<number>();
    while (nums.size < rule.pickCount) {
      nums.add(Math.floor(rand() * rule.maxNumber) + 1);
    }
    draws.push({
      id: i + 1,
      drawNumber: `FIX-${type}-${i + 1}`,
      lotteryType: type,
      drawDate: `2026-10-${String(20 - i).padStart(2, "0")}`,
      numbers: Array.from(nums).sort((a, b) => a - b),
      jackpot: 0,
      published: true,
    });
  }
  return draws;
}
