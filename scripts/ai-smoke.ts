/**
 * AI Smoke Test — kiểm tra kết nối provider AI THẬT end-to-end
 * ============================================================
 * Chạy thủ công (tsx không tự load .env):
 *
 *   set -a; source .env; set +a; npx tsx scripts/ai-smoke.ts [MEGA_645|POWER_655]
 *
 * Flow kiểm tra: config .env → DB (dữ liệu thật) → chatCompletion →
 * parse JSON → validate/supplement số. In kết quả + latency.
 * Exit code: 0 = AI OK, 1 = AI lỗi (dùng được cho ops check/CI manual gate).
 */
import { predictWithAI } from "../src/lib/ai/prediction";
import { getAIConfig } from "../src/lib/ai/client";
import { LOTTERY_RULES, LotteryType } from "../src/types/lottery";

async function main() {
  const arg = process.argv[2];
  const type: LotteryType =
    arg === "POWER_655" ? "POWER_655" : "MEGA_645";

  const cfg = getAIConfig();
  console.log("== AI Smoke Test ==");
  console.log(
    `Provider: ${cfg.provider} | Model: ${cfg.model} | BaseURL: ${cfg.baseUrl} | Enabled: ${cfg.enabled}`
  );

  if (!cfg.enabled) {
    console.error("❌ AI chưa cấu hình — thiếu AI_API_KEY trong .env");
    process.exit(1);
  }

  const startedAt = Date.now();
  const result = await predictWithAI(type, {});

  console.log(
    `\nDữ liệu: ${result.recentDraws.length} kỳ gần nhất (${LOTTERY_RULES[type].nameVi})`
  );
  console.log(`Thống kê fallback: [${result.statistical.numbers.join(", ")}]`);

  if (!result.ai) {
    console.error(`\n❌ AI KHÔNG trả kết quả — lỗi: ${result.aiError ?? "unknown"}`);
    console.error("Fallback thống kê đã thay thế (app vẫn hoạt động, nhưng smoke test FAIL)");
    process.exit(1);
  }

  console.log(`\n✅ AI OK — model: ${result.ai.model} | latency: ${result.ai.latencyMs}ms`);
  console.log(`Số AI đề xuất: [${result.ai.numbers.join(", ")}]`);
  console.log(`Reasoning: ${result.ai.reasoning.slice(0, 300)}`);
  console.log(`Tổng thời gian (bao gồm thống kê + DB): ${Date.now() - startedAt}ms`);

  // Validate: đúng số lượng + trong phạm vi
  const rule = LOTTERY_RULES[type];
  const valid =
    result.ai.numbers.length === rule.pickCount &&
    result.ai.numbers.every(
      (n) => n >= rule.minNumber && n <= rule.maxNumber
    );
  if (!valid) {
    console.error("❌ Số AI đề xuất không đạt validate (số lượng/phạm vi)");
    process.exit(1);
  }
  console.log("✅ Validate pass — smoke test thành công");
}

main().catch((e) => {
  console.error("❌ Smoke test crash:", e);
  process.exit(1);
});
