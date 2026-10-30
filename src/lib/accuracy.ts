/**
 * Accuracy Tracking — theo dõi độ chính xác dự đoán so với kết quả thực tế
 * ============================================================
 * Enterprise feature: mỗi lần dự đoán (thống kê hoặc AI) được ghi vào
 * prediction_log. Khi kỳ mới được đồng bộ, các dự đoán đang chờ được
 * "chấm điểm" tự động (số lượng số trúng) → thống kê độ chính xác tổng hợp.
 *
 * Ý NGHĨA NGHIỆP VỤ (trung thực):
 * - `baseline` = kỳ vọng số trúng nếu chọn ngẫu nhiên hoàn toàn
 *   = pickCount × pickCount / totalNumbers (Mega 6/45: 6×6/45 ≈ 0.80)
 * - `lift` = avgMatches / baseline. lift ≈ 1 → phương pháp KHÔNG nhỉnh hơn
 *   random (đúng bản chất xác suất của xổ số). Lift chỉ mang tính quan sát
 *   quá khứ, KHÔNG dự báo được tương lai.
 *
 * Bất biến chấm điểm: chỉ chấm dự đoán được tạo TRƯỚC ngày của kỳ mới
 * (after_draw_date < draw.drawDate) — backfill các kỳ cũ không gây chấm nhầm.
 */
import {
  DrawResult,
  LotteryType,
  LOTTERY_RULES,
} from "@/types/lottery";
import {
  getUngradedPredictions,
  gradePredictionLog,
  prunePredictionLog,
  getAccuracyAggregate,
  getAccuracyDistribution,
} from "./db";

/** Số lượng số trúng giữa bộ dự đoán và kết quả thực tế (số chính, không tính bonus) */
export function countMatches(
  predicted: number[],
  actual: number[]
): number {
  const actualSet = new Set(actual);
  return new Set(predicted.filter((n) => actualSet.has(n))).size;
}

/**
 * Kỳ vọng số trúng của việc chọn ngẫu nhiên `pickCount` số:
 * E[matches] = pickCount² / totalNumbers.
 */
export function randomBaseline(lotteryType: LotteryType): number {
  const rule = LOTTERY_RULES[lotteryType];
  return (rule.pickCount * rule.pickCount) / rule.totalNumbers;
}

/**
 * Chấm tất cả dự đoán đang chờ của 1 loại hình khi có kỳ mới.
 * Gọi từ syncLotteryType sau khi chèn thành công 1 kỳ MỚI.
 *
 * @returns số bản ghi đã chấm. KHÔNG bao giờ throw — lỗi chấm điểm
 * không được phép làm hỏng sync.
 */
export function gradePredictionsForNewDraw(
  lotteryType: LotteryType,
  draw: DrawResult
): number {
  try {
    const pending = getUngradedPredictions(lotteryType, draw.drawDate);
    let graded = 0;

    for (const row of pending) {
      let predicted: number[];
      try {
        predicted = JSON.parse(row.numbers) as number[];
      } catch {
        continue; // row hỏng — bỏ qua, không chặn các row khác
      }

      const matches = countMatches(predicted, draw.numbers);
      const actualSet = new Set(draw.numbers);
      const matchedNumbers = Array.from(
        new Set(predicted)
      ).filter((n) => actualSet.has(n));

      gradePredictionLog({
        id: row.id,
        gradedDrawNumber: draw.drawNumber,
        gradedDrawDate: draw.drawDate,
        matches,
        matchedNumbers,
      });
      graded++;
    }

    if (graded > 0) prunePredictionLog();
    return graded;
  } catch (error) {
    console.error("[accuracy] Chấm điểm dự đoán thất bại (bỏ qua):", error);
    return 0;
  }
}

/** Thống kê độ chính xác tổng hợp cho 1 loại hình */
export interface AccuracyStats {
  lotteryType: LotteryType;
  /** Tổng số dự đoán đã ghi log */
  totalLogged: number;
  /** Số đã chấm (có kết quả thực tế) */
  totalGraded: number;
  /** Số đang chờ kỳ mới để chấm */
  totalPending: number;
  /** Trung bình số trúng/kỳ của các dự đoán đã chấm (null khi chưa có) */
  avgMatches: number | null;
  /** Kỳ vọng nếu chọn ngẫu nhiên — mốc so sánh trung thực */
  baseline: number;
  /** avgMatches / baseline — ≈1 nghĩa là không nhỉnh hơn random */
  lift: number | null;
  /** Phân phối số trúng: [{matches, count}] từ 0 tới pickCount */
  distribution: Array<{ matches: number; count: number }>;
  /** Số trúng cao nhất từng đạt */
  bestMatches: number | null;
}

/**
 * Tổng hợp độ chính xác từ prediction_log.
 * Aggregate chạy bằng SQL (COUNT/AVG/GROUP BY) — prediction_log nhỏ (< 5000 rows
 * sau prune) nên truy vấn trực tiếp là đủ, không cần cache.
 */
export function getAccuracyStats(lotteryType: LotteryType): AccuracyStats {
  const agg = getAccuracyAggregate(lotteryType);
  const distRows = getAccuracyDistribution(lotteryType);

  const rule = LOTTERY_RULES[lotteryType];
  const baseline = randomBaseline(lotteryType);
  const avgMatches = agg.graded > 0 ? agg.avg_matches : null;

  const distMap = new Map<number, number>(
    distRows.map((r) => [r.matches, r.c])
  );
  const distribution = Array.from(
    { length: rule.pickCount + 1 },
    (_, matches) => ({
      matches,
      count: distMap.get(matches) ?? 0,
    })
  );

  return {
    lotteryType,
    totalLogged: agg.total,
    totalGraded: agg.graded,
    totalPending: agg.pending ?? 0,
    avgMatches: avgMatches !== null ? Math.round(avgMatches * 100) / 100 : null,
    baseline: Math.round(baseline * 100) / 100,
    lift:
      avgMatches !== null && baseline > 0
        ? Math.round((avgMatches / baseline) * 100) / 100
        : null,
    distribution,
    bestMatches: agg.graded > 0 ? agg.best : null,
  };
}
