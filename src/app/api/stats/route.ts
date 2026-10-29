/**
 * GET /api/stats — thống kê nâng cao cho trang /stats:
 * - frequency: tần suất ĐẦY ĐỦ 45/55 số (kể cả số chưa từng xuất hiện)
 * - pairs: ma trận cặp số đồng xuất hiện (danh sách thưa, a < b)
 * - trend: số nóng/lạnh trong cửa sổ window kỳ gần nhất (10/20/50)
 *
 * Dữ liệu lấy tối đa 500 kỳ gần nhất từ SQLite.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDrawHistory } from "@/lib/db";
import { LOTTERY_RULES } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";
import {
  calculateFrequencyStats,
  calculatePairMatrix,
  calculateTrend,
  TREND_WINDOWS,
} from "@/lib/prediction";

const MAX_DRAWS = 500;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = parseLotteryTypeParam(searchParams.get("type"));
    if (!type) {
      return NextResponse.json(
        { error: 'Loại hình không hợp lệ. Hợp lệ: "MEGA_645", "POWER_655"' },
        { status: 400 }
      );
    }

    const windowParam = parseInt(searchParams.get("window") ?? "20", 10);
    const window = (TREND_WINDOWS as readonly number[]).includes(windowParam)
      ? windowParam
      : 20;

    // Toàn bộ lịch sử (tối đa 500 kỳ) cho tần suất + ma trận cặp
    const draws = getDrawHistory(type, 500, 0);
    const frequency = calculateFrequencyStats(draws, type);
    const pairMatrix = calculatePairMatrix(draws, type);
    const trend = calculateTrend(draws, type, window, 5);

    return NextResponse.json({
      data: {
        lotteryType: type,
        lotteryName: LOTTERY_RULES[type].nameVi,
        totalDraws: draws.length,
        window: trend.window,
        frequency,
        pairs: pairMatrix.pairs,
        maxPairCount: pairMatrix.maxCount,
        trend: { hot: trend.hot, cold: trend.cold },
      },
      meta: {
        maxNumbers: LOTTERY_RULES[type].maxNumber,
        pairCount: pairMatrix.pairs.length,
        drawsAnalyzed: pairMatrix.drawsAnalyzed,
      },
    });
  } catch (error) {
    console.error("Error computing stats:", error);
    return NextResponse.json(
      { error: "Lỗi khi tính thống kê" },
      { status: 500 }
    );
  }
}
