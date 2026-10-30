/**
 * Prediction service — tạo dự đoán thống kê cho cả API route và SSR page.
 * Gồm cả accuracy tracking (ghi log mỗi lần tạo dự đoán) — hành vi giữ
 * nguyên so với trước khi tách service.
 */
import {
  predictByFrequency,
  predictByGap,
  predictByFrequencyAndGap,
  getHotAndColdNumbers,
} from "@/lib/prediction";
import { getDrawHistory, insertPredictionLog } from "@/lib/db";
import { LotteryType, Prediction, LOTTERY_RULES } from "@/types/lottery";
import type { FrequencyStats } from "@/types/lottery";
import { cacheGet, cacheSet, drawsCacheKey } from "@/lib/cache";

export const PREDICTION_METHODS = [
  "FREQUENCY",
  "GAP",
  "FREQUENCY_AND_GAP",
] as const;
export type PredictionMethod = (typeof PREDICTION_METHODS)[number];

export interface PredictionResult {
  data: Prediction;
  hotNumbers: FrequencyStats[];
  coldNumbers: FrequencyStats[];
  meta: {
    lotteryType: LotteryType;
    lotteryName: string;
    historyCount: number;
    availableMethods: readonly string[];
  };
}

/** Parse method param — không hợp lệ → dùng mặc định FREQUENCY_AND_GAP */
export function parsePredictionMethod(value: string | null): PredictionMethod {
  if (value && (PREDICTION_METHODS as readonly string[]).includes(value)) {
    return value as PredictionMethod;
  }
  return "FREQUENCY_AND_GAP";
}

/** Tạo 1 dự đoán + ghi prediction_log (log lỗi không ảnh hưởng response) */
export function computePrediction(
  type: LotteryType,
  method: PredictionMethod,
  count: number = 6
): { error: string } | PredictionResult {
  const draws = getDrawHistory(type, 100, 0);

  if (draws.length === 0) {
    return {
      error: "Chưa có đủ dữ liệu để dự đoán — vui lòng đồng bộ dữ liệu trước",
    };
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

  // Accuracy tracking: ghi log dự đoán (chờ kỳ mới để chấm điểm).
  // insertPredictionLog không bao giờ throw — lỗi log không ảnh hưởng response.
  if (draws[0]) {
    insertPredictionLog({
      lotteryType: type,
      method: prediction.method,
      numbers: finalNumbers,
      confidence: prediction.confidence,
      afterDrawNumber: draws[0].drawNumber,
      afterDrawDate: draws[0].drawDate,
    });
  }

  // Lấy thêm số nóng/lạnh (cache 60s — tránh tính lại frequency trên 100 kỳ mỗi request)
  const hotColdKey = drawsCacheKey("hotcold", type, 10);
  const hotCold =
    cacheGet<ReturnType<typeof getHotAndColdNumbers>>(hotColdKey) ??
    (() => {
      const result = getHotAndColdNumbers(type, 10);
      cacheSet(hotColdKey, result);
      return result;
    })();

  return {
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
      availableMethods: PREDICTION_METHODS,
    },
  };
}
