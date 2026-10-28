import { NextRequest, NextResponse } from "next/server";
import { getDrawHistory, countDraws } from "@/lib/db";
import { LOTTERY_RULES } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";

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
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const draws = getDrawHistory(type, limit, offset);
    const total = countDraws(type);

    return NextResponse.json({
      data: draws,
      meta: {
        lotteryType: type,
        lotteryName: LOTTERY_RULES[type].nameVi,
        total,
        limit,
        offset,
        hasMore: offset + draws.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching draw history:", error);
    return NextResponse.json(
      { error: "Lỗi khi lấy lịch sử kết quả" },
      { status: 500 }
    );
  }
}
