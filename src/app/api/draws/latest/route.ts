import { NextRequest, NextResponse } from "next/server";
import { getLatestDraw, countDraws } from "@/lib/db";
import { getDataSourceStatus } from "@/lib/db";
import { LOTTERY_RULES } from "@/types/lottery";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") ?? "MEGA_645") as "MEGA_645" | "POWER_655";

    const draw = getLatestDraw(type);
    const total = countDraws(type);
    const source = getDataSourceStatus();

    return NextResponse.json({
      data: draw,
      meta: {
        lotteryType: type,
        lotteryName: LOTTERY_RULES[type].nameVi,
        totalRecords: total,
        dataSource: source,
      },
    });
  } catch (error) {
    console.error("Error fetching latest draw:", error);
    return NextResponse.json(
      { error: "Lỗi khi lấy kết quả mới nhất" },
      { status: 500 }
    );
  }
}
