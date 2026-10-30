/**
 * API Dự đoán AI — kết hợp thống kê + AI qua .env
 * Fallback: AI lỗi → trả thống kê, kèm trạng thái AI minh bạch
 */
import { NextRequest, NextResponse } from "next/server";
import { predictWithAI } from "@/lib/ai/prediction";
import { LOTTERY_RULES } from "@/types/lottery";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseLotteryTypeParam } from "@/lib/validate";
import { insertPredictionLog } from "@/lib/db";

export const dynamic = "force-dynamic"; // AI prediction không cache

/** Per-IP 10/phút + trần tổng 40/phút — mỗi lần gọi tốn chi phí AI thật. */
const AI_RATE_LIMIT = { limit: 10, windowMs: 60_000, globalLimit: 60 };

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const rl = checkRateLimit(
      "ai-prediction",
      request.headers,
      AI_RATE_LIMIT.limit,
      AI_RATE_LIMIT.windowMs,
      { globalLimit: AI_RATE_LIMIT.globalLimit }
    );
    if (rl) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu dự đoán AI. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = parseLotteryTypeParam(searchParams.get("type"));
    if (!type) {
      return NextResponse.json(
        { error: 'Loại hình không hợp lệ. Hợp lệ: "MEGA_645", "POWER_655"' },
        { status: 400 }
      );
    }
    const historyLimit = Math.min(
      Math.max(parseInt(searchParams.get("historyLimit") ?? "30", 10) || 30, 5),
      100
    );
    const favoriteNumbers = (searchParams.get("favorites") ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const result = await predictWithAI(type, { historyLimit, favoriteNumbers });

    // Accuracy tracking: ghi log cả dự đoán thống kê lẫn AI (nếu có).
    // KHÔNG bao giờ làm hỏng response chính — insertPredictionLog nuốt error nội bộ.
    // Lưu ý: recentDraws sắp xếp cũ → mới (getDrawsForAI) — kỳ mới nhất là phần tử CUỐI.
    const newestDraw = result.recentDraws[result.recentDraws.length - 1];
    if (newestDraw) {
      insertPredictionLog({
        lotteryType: type,
        method: result.statistical.method,
        numbers: result.statistical.numbers,
        confidence: result.statistical.confidence,
        afterDrawNumber: newestDraw.drawNumber,
        afterDrawDate: newestDraw.drawDate,
      });
      if (result.ai && result.ai.numbers.length > 0) {
        insertPredictionLog({
          lotteryType: type,
          method: "AI",
          numbers: result.ai.numbers,
          confidence: result.statistical.confidence, // AI không có confidence riêng — dùng trần thống kê
          afterDrawNumber: newestDraw.drawNumber,
          afterDrawDate: newestDraw.drawDate,
        });
      }
    }

    return NextResponse.json({
      data: result,
      meta: {
        lotteryType: type,
        lotteryName: LOTTERY_RULES[type].nameVi,
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error("[api/ai-prediction] Lỗi:", error);
    return NextResponse.json(
      { error: "Lỗi khi tạo dự đoán AI" },
      { status: 500 }
    );
  }
}
