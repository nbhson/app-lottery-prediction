import { NextRequest, NextResponse } from "next/server";
import { LOTTERY_RULES } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";
import { computePrediction, parsePredictionMethod } from "@/lib/prediction-service";

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
    const method = parsePredictionMethod(searchParams.get("method"));
    const count = parseInt(searchParams.get("count") ?? "6");

    const result = computePrediction(type, method, count);

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, data: null },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating prediction:", error);
    return NextResponse.json(
      { error: "Lỗi khi tạo dự đoán" },
      { status: 500 }
    );
  }
}
