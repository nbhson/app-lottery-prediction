import { NextRequest, NextResponse } from "next/server";
import {
  predictByFrequency,
  predictByGap,
  predictByFrequencyAndGap,
  getHotAndColdNumbers,
} from "@/lib/prediction";
import { getDrawHistory } from "@/lib/db";
import { Prediction, LOTTERY_RULES } from "@/types/lottery";
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
    const method = searchParams.get("method") ?? "FREQUENCY_AND_GAP";
    const count = parseInt(searchParams.get("count") ?? "6");

    const draws = getDrawHistory(type, 100, 0);

    if (draws.length === 0) {
      return NextResponse.json({
        error: "Chưa có đủ dữ liệu để dự đoán",
        data: null,
      });
    }

    let prediction: Prediction;

    switch (method) {
      case "FREQUENCY":
        prediction = predictByFrequency(type, draws, count);
        break;
      case "GAP":
        prediction = predictByGap(type, draws, count);
        break;
      case "FREQUENCY_AND_GAP":
      default:
        prediction = predictByFrequencyAndGap(type, draws, count);
        break;
    }

    // Đảm bảo số lượng đúng quy tắc
    const rule = LOTTERY_RULES[type];
    const finalNumbers = prediction.numbers.slice(0, rule.pickCount);

    // Lấy thêm số nóng/lạnh
    const hotCold = getHotAndColdNumbers(type, 10);

    return NextResponse.json({
      data: {
        ...prediction,
        numbers: finalNumbers,
      },
      hotNumbers: hotCold.hot,
      coldNumbers: hotCold.cold,
      meta: {
        lotteryType: type,
        lotteryName: rule.nameVi,
        historyCount: draws.length,
        availableMethods: ["FREQUENCY", "GAP", "FREQUENCY_AND_GAP"],
      },
    });
  } catch (error) {
    console.error("Error generating prediction:", error);
    return NextResponse.json(
      { error: "Lỗi khi tạo dự đoán" },
      { status: 500 }
    );
  }
}
