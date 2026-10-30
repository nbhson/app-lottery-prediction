/**
 * Stats service — tính payload thống kê cho cả API route và SSR page.
 * Dùng chung một hàm để API và trang server render luôn nhất quán,
 * đồng thời hưởng chung cache TTL (invalidate khi sync kỳ mới).
 */
import { getDrawHistory } from "@/lib/db";
import {
  calculateFrequencyStats,
  calculatePairMatrix,
  calculateTrend,
  calculateSumStats,
} from "@/lib/prediction";
import { LotteryType, FrequencyStats, LOTTERY_RULES } from "@/types/lottery";
import type { PairStat, SumStats } from "@/types/lottery";
import { cacheGet, cacheSet, drawsCacheKey } from "@/lib/cache";

const MAX_DRAWS = 500;

export interface StatsPayload {
  data: {
    lotteryType: LotteryType;
    lotteryName: string;
    totalDraws: number;
    window: number;
    frequency: ReturnType<typeof calculateFrequencyStats>;
    pairs: PairStat[];
    maxPairCount: number;
    trend: { hot: FrequencyStats[]; cold: FrequencyStats[] };
    sumStats: SumStats;
  };
  meta: {
    maxNumbers: number;
    pairCount: number;
    drawsAnalyzed: number;
  };
}

/**
 * Tính toàn bộ thống kê cho trang /stats — cache TTL 60s theo (type, window).
 */
export function computeStatsPayload(
  type: LotteryType,
  window: number
): StatsPayload {
  const cacheKey = drawsCacheKey("stats", type, window);
  const cached = cacheGet<StatsPayload>(cacheKey);
  if (cached) return cached;

  const draws = getDrawHistory(type, MAX_DRAWS, 0);
  const frequency = calculateFrequencyStats(draws, type);
  const pairMatrix = calculatePairMatrix(draws, type);
  const trend = calculateTrend(draws, type, window, 5);
  const sumStats = calculateSumStats(draws, type, 50);

  const payload: StatsPayload = {
    data: {
      lotteryType: type,
      lotteryName: LOTTERY_RULES[type].nameVi,
      totalDraws: draws.length,
      window: trend.window,
      frequency,
      pairs: pairMatrix.pairs,
      maxPairCount: pairMatrix.maxCount,
      trend: { hot: trend.hot, cold: trend.cold },
      sumStats,
    },
    meta: {
      maxNumbers: LOTTERY_RULES[type].maxNumber,
      pairCount: pairMatrix.pairs.length,
      drawsAnalyzed: pairMatrix.drawsAnalyzed,
    },
  };

  cacheSet(cacheKey, payload);
  return payload;
}
