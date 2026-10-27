/**
 * Dự đoán AI — kết hợp thống kê + AI (OpenAI-compatible)
 * ============================================================
 * Chiến lược enterprise:
 * 1. Luôn tính thống kê trước (tần suất + gap) — nhanh, không tốn tiền
 * 2. Gọi AI qua config .env (OpenAI-compatible API)
 * 3. AI lỗi / timeout / thiếu API key → fallback: trả thống kê, aiUsed: false
 * 4. Mỗi kết quả đều kèm disclaimer rõ ràng "không đảm bảo trúng"
 */

import {
  LotteryType,
  LOTTERY_RULES,
  Prediction,
  FrequencyStats,
  DrawResult,
} from "@/types/lottery";
import { getDrawsForAI } from "@/lib/db";
import { chatCompletion } from "@/lib/ai/client";
import {
  predictByFrequencyAndGap,
  calculateFrequencyStats,
} from "@/lib/prediction";
import { getConfig } from "@/lib/config";

export interface AIPredictionResult {
  /** Loại hình xổ số */
  lotteryType: LotteryType;
  /** Dự đoán thống kê — luôn có, là fallback cuối cùng */
  statistical: Prediction;
  /** Số nóng (hay xuất hiện) */
  hotNumbers: FrequencyStats[];
  /** Số lạnh (ít xuất hiện / lâu chưa ra) */
  coldNumbers: FrequencyStats[];
  /** Lịch sử dùng để tính toán (mới nhất trước) */
  recentDraws: DrawResult[];
  /** AI có tham gia tạo dự đoán hay không */
  aiUsed: boolean;
  /** Lỗi AI nếu có — để UI hiển thị trạng thái minh bạch */
  aiError?: string;
  /** Kết quả dự đoán từ AI — null khi AI không khả dụng */
  ai: {
    numbers: number[];
    reasoning: string;
    model?: string;
    latencyMs?: number;
  } | null;
  /** Disclaimer bắt buộc hiển thị */
  disclaimer: string;
}

const DISCLAIMER =
  "⚠️ AI và thống kê KHÔNG đảm bảo trúng. Xổ số là ngẫu nhiên hoàn toàn — mỗi kỳ quay độc lập. Chỉ mang tính tham khảo.";

/** Prompt hệ thống — bắt buộc AI trả JSON, không thêm nội dung khác */
function buildSystemPrompt(lotteryType: LotteryType): string {
  const rule = LOTTERY_RULES[lotteryType];
  return [
    `Bạn là trợ lý phân tích thống kê xổ số ${rule.nameVi} của Việt Nam.`,
    `Nhiệm vụ: đề xuất ${rule.pickCount} số trong phạm vi ${rule.minNumber}–${rule.maxNumber} dựa trên dữ liệu lịch sử.`,
    `QUY TẮC BẮT BUỘC:`,
    `1. Chỉ trả về JSON hợp lệ, không thêm text ngoài JSON.`,
    `2. Format chính xác: {"numbers":[số1,...,số${rule.pickCount}],"reasoning":"giải thích ngắn bằng tiếng Việt"}`,
    `3. Mảng numbers: đúng ${rule.pickCount} số nguyên, trong khoảng ${rule.minNumber}–${rule.maxNumber}, không trùng.`,
    `4. Luôn nhắc: gợi ý tham khảo, không đảm bảo trúng.`,
  ].join("\n");
}

/** Prompt người dùng — ngữ cảnh thống kê + lịch sử */
function buildUserPrompt(
  lotteryType: LotteryType,
  draws: DrawResult[],
  hotNumbers: FrequencyStats[],
  coldNumbers: FrequencyStats[]
): string {
  const rule = LOTTERY_RULES[lotteryType];
  const history = draws
    .slice(0, 10)
    .map((d) => `Kỳ ${d.drawNumber} (${d.drawDate}): [${d.numbers.join(", ")}]`)
    .join("\n");
  const hotList = hotNumbers
    .slice(0, 8)
    .map((s) => `${s.number}(${s.count} lần)`)
    .join(", ");
  const coldList = coldNumbers
    .slice(0, 10)
    .map((s) => `${s.number} (gap ${s.gap})`)
    .join(", ");

  return [
    `Dữ liệu ${rule.nameVi} — ${draws.length} kỳ gần nhất (cũ → mới):`,
    history,
    "",
    `Top số hay ra: ${hotList}`,
    `Top số lâu chưa ra: ${coldList}`,
    "",
    `Hãy đề xuất ${rule.pickCount} số cho kỳ tới.`,
    `Chỉ trả JSON: {"numbers":[...],"reasoning":"..."}`,
  ].join("\n");
}

/** Parse JSON từ AI — chịu được markdown code fence */
function parseAIPrediction(
  content: string,
  pickCount: number
): { numbers: number[]; reasoning: string } | null {
  try {
    const cleaned = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    const json = JSON.parse(cleaned.substring(start, end)) as {
      numbers?: unknown;
      reasoning?: unknown;
    };
    if (!Array.isArray(json.numbers)) return null;
    return {
      numbers: (json.numbers as unknown[])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n)),
      reasoning: String(json.reasoning ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Dự đoán kết hợp: thống kê + AI.
 *
 * Flow:
 * 1. Luôn tính thống kê (fallback cuối cùng)
 * 2. Nếu AI không được cấu hình → trả thống kê, aiUsed: false
 * 3. Gọi AI với ngữ cảnh thống kê
 * 4. AI lỗi → fallback thống kê
 * 5. Parse AI JSON → validate → supplement từ stats nếu thiếu
 */
export async function predictWithAI(
  lotteryType: LotteryType,
  options?: {
    /** Số yêu thích của người dùng (để tham khảo, không bắt buộc) */
    favoriteNumbers?: number[];
    /** Số kỳ lịch sử lấy cho AI (mặc định 30) */
    historyLimit?: number;
  }
): Promise<AIPredictionResult> {
  const rule = LOTTERY_RULES[lotteryType];
  const limit = options?.historyLimit ?? 30;

  // 1. Lấy dữ liệu + thống kê (luôn có)
  const draws = getDrawsForAI(lotteryType, limit);
  const stats = calculateFrequencyStats(draws, lotteryType);
  const hot = [...stats].sort((a, b) => b.count - a.count).slice(0, 10);
  const cold = [...stats].sort((a, b) => b.gap - a.gap).slice(0, 10);
  const statistical = predictByFrequencyAndGap(lotteryType, draws, rule.pickCount);

  const baseResult: AIPredictionResult = {
    lotteryType,
    statistical,
    hotNumbers: hot,
    coldNumbers: cold,
    recentDraws: draws.slice(0, 10),
    aiUsed: false,
    ai: null,
    disclaimer: DISCLAIMER,
  };

  // 2. AI không được cấu hình → fallback thống kê
  const cfg = getConfig();
  if (!cfg.ai.enabled) {
    return { ...baseResult, aiError: "AI_NOT_CONFIGURED" };
  }

  // 3. Gọi AI
  const systemPrompt = buildSystemPrompt(lotteryType);
  const userPrompt = buildUserPrompt(lotteryType, draws, hot, cold);
  const aiResult = await chatCompletion(systemPrompt, userPrompt, {
    temperature: 0.7,
    maxTokens: 400,
  });

  if (!aiResult.success) {
    return {
      ...baseResult,
      aiUsed: false,
      aiError: aiResult.error ?? "AI_ERROR",
    };
  }

  // 4. Parse AI JSON response
  const parsed = parseAIPrediction(aiResult.content ?? "", rule.pickCount);
  if (!parsed) {
    return {
      ...baseResult,
      aiUsed: true,
      aiError: "AI_PARSE_ERROR: response không đúng định dạng JSON",
    };
  }

  // 5. Validate & supplement
  const uniqueValid: number[] = [];
  const seen = new Set<number>();
  for (const n of parsed.numbers) {
    if (
      !seen.has(n) &&
      Number.isInteger(n) &&
      n >= rule.minNumber &&
      n <= rule.maxNumber
    ) {
      seen.add(n);
      uniqueValid.push(n);
    }
  }

  // Nếu AI không trả đủ số → bổ sung từ stats
  if (uniqueValid.length < rule.pickCount) {
    const statNums = statistical.numbers.filter((n) => !uniqueValid.includes(n));
    for (const n of statNums) {
      if (uniqueValid.length >= rule.pickCount) break;
      if (!uniqueValid.includes(n)) uniqueValid.push(n);
    }
  }

  return {
    ...baseResult,
    aiUsed: true,
    ai: {
      numbers: uniqueValid.slice(0, rule.pickCount),
      reasoning: parsed.reasoning,
      model: aiResult.model,
      latencyMs: aiResult.latencyMs,
    },
  };
}