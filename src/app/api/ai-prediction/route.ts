/**
 * API Dự đoán AI — kết hợp thống kê + AI qua .env
 * Fallback: AI lỗi → trả thống kê, kèm trạng thái AI minh bạch
 */
import { NextRequest, NextResponse } from "next/server";
import { predictWithAI } from "@/lib/ai/prediction";
import { LOTTERY_RULES } from "@/types/lottery";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic"; // AI prediction không cache

/** Giới hạn 10 request/phút/IP — mỗi lần gọi tốn chi phí AI thật. */
const AI_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const rl = checkRateLimit("ai-prediction", request.headers, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs);
    if (rl) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu dự đoán AI. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") ?? "MEGA_645") as "MEGA_645" | "POWER_655";
    const historyLimit = Math.min(
      Math.max(parseInt(searchParams.get("historyLimit") ?? "30", 10) || 30, 5),
      100
    );
    const favoriteNumbers = (searchParams.get("favorites") ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const result = await predictWithAI(type, { historyLimit, favoriteNumbers });

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
