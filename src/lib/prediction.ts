/**
 * Module thống kê & dự đoán — Tần suất + Khoảng trống (Gap)
 *
 * Phương pháp:
 * - Tần suất: đếm số lần mỗi số xuất hiện trong lịch sử
 * - Khoảng trống: tính số kỳ mà 1 số chưa xuất hiện
 *
 * CẢNH BÁO: Đây chỉ là THỐNG KÊ, KHÔNG đảm bảo trúng.
 * Mỗi kỳ quay là sự kiện ngẫu nhiên độc lập.
 */
import {
  DrawResult,
  FrequencyStats,
  LotteryType,
  Prediction,
  LOTTERY_RULES,
  PairStat,
  PairMatrixResult,
} from "@/types/lottery";
import { getDrawHistory } from "./db";

/**
 * Tính thống kê tần suất cho 1 loại hình xổ số.
 *
 * BẤT BIẾN THỨ TỰ: `draws` phải sắp xếp MỚI NHẤT TRƯỚC (đúng thứ tự
 * getDrawHistory/getDrawsForAI trả về). `gap` đo bằng SỐ KỲ: số kỳ gần nhất
 * mà số đó chưa xuất hiện (số trong kỳ mới nhất → gap 0; chưa từng ra → gap = tổng số kỳ).
 */
export function calculateFrequencyStats(
  draws: DrawResult[],
  lotteryType: LotteryType
): FrequencyStats[] {
  const rule = LOTTERY_RULES[lotteryType];
  const allNumbers = Array.from(
    { length: rule.maxNumber - rule.minNumber + 1 },
    (_, i) => i + rule.minNumber
  );

  const lastAppearances = new Map<number, string>();
  const gapOf = new Map<number, number>();

  // Duyệt mới nhất → cũ nhất: gap = index kỳ GẦN NHẤT chứa số (đơn vị: số kỳ)
  for (let i = 0; i < draws.length; i++) {
    for (const num of draws[i].numbers) {
      if (!lastAppearances.has(num)) {
        lastAppearances.set(num, draws[i].drawDate);
        gapOf.set(num, i);
      }
    }
  }

  // Đếm tần suất
  const counts = new Map<number, number>();
  for (const draw of draws) {
    for (const num of draw.numbers) {
      counts.set(num, (counts.get(num) ?? 0) + 1);
    }
  }

  // Xây dựng kết quả cho TẤT CẢ các số (kể cả chưa xuất hiện)
  return allNumbers.map((num) => {
    const count = counts.get(num) ?? 0;
    const lastAppeared = lastAppearances.get(num) ?? "";
    // Chưa từng xuất hiện = gap bằng tổng số kỳ đã phân tích (cùng đơn vị "số kỳ")
    const gap = gapOf.get(num) ?? draws.length;

    return { number: num, count, lastAppeared, gap };
  });
}

/**
 * Dự đoán dựa trên tần suất — chọn các số xuất hiện NHIỀU NHẤT
 */
export function predictByFrequency(
  lotteryType: LotteryType,
  draws: DrawResult[],
  topN?: number
): Prediction {
  const rule = LOTTERY_RULES[lotteryType];
  const stats = calculateFrequencyStats(draws, lotteryType);

  // Sắp xếp theo tần suất giảm dần
  const sorted = [...stats].sort((a, b) => b.count - a.count);

  // Trọng số: tần suất chuẩn hóa → điểm
  const maxCount = sorted[0]?.count ?? 1;
  const topNumbers = sorted
    .filter((s) => s.count > 0)
    .slice(0, topN ?? rule.pickCount)
    .map((s) => ({
      number: s.number,
      score: s.count / maxCount,
    }));

  // Độ tin cậy TƯƠNG ĐỐI (0–45): phản ánh độ phủ dữ liệu + mức lệch đều
  // của tần suất. KHÔNG phải xác suất trúng — kết quả quay là ngẫu nhiên.
  const avgCount = stats.reduce((a, b) => a + b.count, 0) / stats.length;
  const variance =
    stats.reduce((a, b) => a + Math.pow(b.count - avgCount, 2), 0) /
    stats.length;
  const cv = avgCount > 0 ? Math.sqrt(variance) / avgCount : 0;
  const sampleFactor = Math.min(1, draws.length / 50);
  const confidence = Math.round(
    Math.max(10, Math.min(45, (20 + cv * 25) * (0.5 + 0.5 * sampleFactor)))
  );

  return {
    numbers: topNumbers.map((t) => t.number),
    method: "FREQUENCY",
    confidence,
    description: `Phương pháp tần suất: chọn ${topNumbers.length} số xuất hiện nhiều nhất trong lịch sử. Trọng số: tần suất chuẩn hóa. Lưu ý: mỗi kỳ quay là sự kiện ngẫu nhiên độc lập — không đảm bảo trúng.`,
    lotteryType,
  };
}

/**
 * Dự đoán dựa trên khoảng trống (gap) — chọn các số LÂU CHƯA RA
 */
export function predictByGap(
  lotteryType: LotteryType,
  draws: DrawResult[],
  topN?: number
): Prediction {
  const rule = LOTTERY_RULES[lotteryType];
  const stats = calculateFrequencyStats(draws, lotteryType);

  // Sắp xếp theo gap giảm dần (số lâu chưa ra nhất)
  const sorted = [...stats].sort((a, b) => b.gap - a.gap);
  const topGaps = sorted.slice(0, topN ?? rule.pickCount);

  // Độ tin cậy TƯƠNG ĐỐI (0–40): gap càng lớn so với cửa sổ dữ liệu,
  // dữ liệu càng phủ → chỉ số càng "có cơ sở thống kê để tham khảo".
  // KHÔNG phải xác suất trúng — xác suất mỗi số không đổi giữa các kỳ.
  const maxGap = sorted[0]?.gap ?? 1;
  const gapRatio = draws.length > 0 ? Math.min(1, maxGap / draws.length) : 0;
  const confidence = Math.round(
    Math.max(10, Math.min(40, 15 + gapRatio * 25 * Math.min(1, draws.length / 50)))
  );

  return {
    numbers: topGaps.map((s) => s.number),
    method: "GAP",
    confidence,
    description: `Phương pháp khoảng trống: chọn ${topGaps.length} số có khoảng cách (gap) lớn nhất — tức lâu chưa xuất hiện trong lịch sử. "Lý thuyết" (không chính xác): các số chưa ra lâu có thể có xu hướng quay lại. Thực tế: xác suất mỗi số không thay đổi giữa các kỳ. Không đảm bảo trúng.`,
    lotteryType,
  };
}

/**
 * Dự đoán kết hợp: tần suất + gap
 */
export function predictByFrequencyAndGap(
  lotteryType: LotteryType,
  draws: DrawResult[],
  topN?: number
): Prediction {
  const rule = LOTTERY_RULES[lotteryType];
  const stats = calculateFrequencyStats(draws, lotteryType);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);
  const maxGap = Math.max(...stats.map((s) => s.gap), 1);

  // Trộn điểm: mỗi số có điểm = (tần suất chuẩn hóa) * 0.5 + (gap chuẩn hóa) * 0.5
  const scored = stats.map((s) => ({
    number: s.number,
    score: (s.count / maxCount) * 0.5 + (s.gap / maxGap) * 0.5,
  }));

  // Chọn top N theo điểm
  const topNumbers = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN ?? rule.pickCount);

  // Điểm tin cậy TƯƠNG ĐỐI (0–45): trung bình tín hiệu tần suất + gap,
  // trần 45 để không tạo ảo giác về độ chính xác. KHÔNG phải xác suất trúng.
  const gapRatio = draws.length > 0 ? Math.min(1, maxGap / draws.length) : 0;
  const confidence = Math.round(
    Math.max(
      10,
      Math.min(45, 15 + gapRatio * 30 * Math.min(1, draws.length / 50))
    )
  );

  return {
    numbers: topNumbers.map((t) => t.number),
    method: "FREQUENCY_AND_GAP",
    confidence,
    description: `Phương pháp kết hợp: trọng số 50% tần suất + 50% khoảng trống. Điểm = (tần suất chuẩn hóa)×0.5 + (gap chuẩn hóa)×0.5. Kết hợp cả "số hay ra" và "số lâu chưa ra". Không đảm bảo trúng — xác suất mỗi số là như nhau ở mỗi kỳ quay.`,
    lotteryType,
  };
}

/**
 * Lấy top N số nóng/lạnh
 */
export function getHotAndColdNumbers(
  lotteryType: LotteryType,
  top: number = 10
): {
  hot: FrequencyStats[];
  cold: FrequencyStats[];
} {
  const allDraws = getDrawHistory(lotteryType, 100, 0);
  const stats = calculateFrequencyStats(allDraws, lotteryType);
  const sorted = [...stats].sort((a, b) => b.count - a.count);

  return {
    hot: sorted.slice(0, top),
    cold: sorted.slice(-top).reverse(),
  };
}

// ============================================================
// Thống kê nâng cao cho trang /stats
// ============================================================

export type { PairStat, PairMatrixResult } from "@/types/lottery";

/**
 * Ma trận đồng xuất hiện của cặp số: với mỗi kỳ, mọi cặp 2 số trong bộ kết quả
 * được đếm 1 lần. Trả về danh sách thưa (a < b) để dựng heatmap ma trận cặp.
 */
export function calculatePairMatrix(
  draws: DrawResult[],
  lotteryType: LotteryType
): PairMatrixResult {
  const rule = LOTTERY_RULES[lotteryType];
  const counts = new Map<string, number>();

  for (const draw of draws) {
    const nums = draw.numbers.filter(
      (n) => n >= rule.minNumber && n <= rule.maxNumber
    );
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = Math.min(nums[i], nums[j]);
        const b = Math.max(nums[i], nums[j]);
        const key = `${a}-${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: PairStat[] = Array.from(counts.entries()).map(([key, count]) => {
    const [a, b] = key.split("-").map(Number);
    return { a, b, count };
  });

  return {
    pairs,
    maxCount: pairs.reduce((m, p) => Math.max(m, p.count), 0),
    drawsAnalyzed: draws.length,
  };
}

/** Các cửa sổ kỳ cho xu hướng nóng/lạnh */
export const TREND_WINDOWS = [10, 20, 50] as const;

export interface TrendResult {
  window: number; // số kỳ thực tế đã phân tích
  hot: FrequencyStats[];
  cold: FrequencyStats[];
  drawsAnalyzed: number;
}

/**
 * Xu hướng số nóng/lạnh trong N kỳ gần nhất (N ∈ 10/20/50).
 * `draws` phải sắp xếp mới nhất trước (đúng thứ tự getDrawHistory trả về).
 *
 * - hot: count giảm dần (ra nhiều nhất trong cửa sổ)
 * - cold: count tăng dần rồi gap giảm dần (ít ra nhất, lâu nhất mới ra)
 */
export function calculateTrend(
  draws: DrawResult[],
  lotteryType: LotteryType,
  windowSize: number,
  top: number = 5
): TrendResult {
  const recent = draws.slice(0, Math.max(1, Math.min(windowSize, draws.length)));
  const stats = calculateFrequencyStats(recent, lotteryType);

  const hot = [...stats]
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, top);
  const cold = [...stats]
    .sort((a, b) => a.count - b.count || b.gap - a.gap || a.number - b.number)
    .slice(0, top);

  return { window: recent.length, hot, cold, drawsAnalyzed: recent.length };
}
