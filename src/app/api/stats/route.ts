/**
 * GET /api/stats — thống kê nâng cao cho trang /stats:
 * - frequency: tần suất ĐẦY ĐỦ 45/55 số (kể cả số chưa từng xuất hiện)
 * - pairs: ma trận cặp số đồng xuất hiện (danh sách thưa, a < b)
 * - trend: số nóng/lạnh trong cửa sổ window kỳ gần nhất (10/20/50)
 * - sumStats: tổng bộ số theo kỳ (50 kỳ) + tỷ lệ chẵn/lẻ
 *
 * Logic tính toán nằm ở stats-service (dùng chung với SSR page) — có cache TTL
 * 60s, tự invalidate khi sync chèn kỳ mới.
 */
import { NextRequest, NextResponse } from "next/server";
import { LOTTERY_RULES } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";
import { computeStatsPayload } from "@/lib/stats-service";
import { TREND_WINDOWS } from "@/lib/prediction";

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

    return NextResponse.json(computeStatsPayload(type, window));
  } catch (error) {
    console.error("Error computing stats:", error);
    return NextResponse.json(
      { error: "Lỗi khi tính thống kê" },
      { status: 500 }
    );
  }
}
