/**
 * GET /api/accuracy — thống kê độ chính xác dự đoán (accuracy tracking)
 *
 * Trả về: tổng số dự đoán đã log / đã chấm / đang chờ, trung bình số trúng,
 * baseline random, lift (≈1 → không nhỉnh hơn random — trung thực theo
 * bản chất xác suất), phân phối số trúng.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAccuracyStats } from "@/lib/accuracy";
import { LOTTERY_RULES } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";

export const dynamic = "force-dynamic";

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

    const stats = getAccuracyStats(type);

    return NextResponse.json({
      data: stats,
      meta: {
        lotteryType: type,
        lotteryName: LOTTERY_RULES[type].nameVi,
        note: "Lift ≈ 1 nghĩa là phương pháp không nhỉnh hơn chọn ngẫu nhiên — đúng bản chất xác suất của xổ số.",
      },
    });
  } catch (error) {
    console.error("[api/accuracy] Lỗi:", error);
    return NextResponse.json(
      { error: "Lỗi khi tính độ chính xác dự đoán" },
      { status: 500 }
    );
  }
}
