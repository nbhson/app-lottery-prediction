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
import { DrawResult, FrequencyStats, LotteryType, Prediction, LOTTERY_RULES } from "@/types/lottery";
import { getDrawHistory } from "./db";

/**
 * Tính thống kê tần suất cho 1 loại hình xổ số
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

  const latestDate = draws[0]?.drawDate ?? "";
  const lastAppearances = new Map<number, string>();

  // Lần xuất hiện cuối của mỗi số
  for (const draw of draws) {
    for (const num of draw.numbers) {
      lastAppearances.set(num, draw.drawDate);
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
    const gap = lastAppeared
      ? calculateGap(lastAppeared, latestDate)
      : draws.length; // chưa bao giờ xuất hiện = gap = tổng số kỳ

    return { number: num, count, lastAppeared, gap };
  });
}

/**
 * Tính số ngày/kỳ giữa 2 ngày (đơn giản hóa — mỗi kỳ ~3-4 ngày)
 */
function calculateGap(fromDate: string, toDate: string): number {
  // Ước lượng: mỗi kỳ cách nhau khoảng 3-4 ngày (Mega quay 2 lần/tuần)
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const days = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.round(days / 3.5));
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

  // Điểm tin cậy tương đối (dựa trên variance của tần suất)
  const avgCount = stats.reduce((a, b) => a + b.count, 0) / stats.length;
  const variance =
    stats.reduce((a, b) => a + Math.pow(b.count - avgCount, 2), 0) /
    stats.length;
  const confidence = Math.round(Math.max(20, Math.min(60, 50 - variance * 5)));

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

  const maxGap = sorted[0]?.gap ?? 1;
  const confidence = Math.round(Math.max(15, Math.min(55, 35 + maxGap * 2)));

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

  const confidence = Math.round(Math.max(20, Math.min(65, 40 + maxGap)));

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
