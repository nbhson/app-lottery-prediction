/**
 * StatsClient — phần tương tác của trang /stats (client component).
 * Nhận payload thống kê ban đầu từ Server Component (page.tsx) → lần render
 * đầu đã có dữ liệu thật. Đổi loại hình/khoảng → fetch /api/stats.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { LOTTERY_RULES, LotteryType, FrequencyStats } from "@/types/lottery";
import TypeSelector from "@/components/TypeSelector";
import StatBar from "@/components/StatBar";
import FrequencyChart from "@/components/FrequencyChart";
import PairHeatmap from "@/components/PairHeatmap";
import SumTrendChart from "@/components/SumTrendChart";
import type { PairStat, SumStats } from "@/types/lottery";
// TREND_WINDOWS là constant nhỏ — định nghĩa local để tránh import lib/prediction
// (chứa better-sqlite3 qua lib/db) vào bundle client
const TREND_WINDOWS = [10, 20, 50] as const;

export interface StatsData {
  lotteryType: LotteryType;
  lotteryName: string;
  totalDraws: number;
  window: number;
  frequency: FrequencyStats[];
  pairs: PairStat[];
  maxPairCount: number;
  trend: { hot: FrequencyStats[]; cold: FrequencyStats[] };
  sumStats?: SumStats;
}

/** Top cặp đồng xuất hiện nhiều nhất */
function topPairs(pairs: PairStat[], top: number): PairStat[] {
  return [...pairs]
    .sort((a, b) => b.count - a.count || a.a - b.a || a.b - b.b)
    .slice(0, top);
}

export default function StatsClient({
  initialData,
  initialWindow,
}: {
  initialData: StatsData;
  initialWindow: number;
}) {
  const [selectedType, setSelectedType] = useState<LotteryType>(initialData.lotteryType);
  const [windowSize, setWindowSize] = useState<number>(initialWindow);
  const [stats, setStats] = useState<StatsData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async (type: LotteryType, win: number) => {
    setSelectedType(type);
    setWindowSize(win);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats?type=${type}&window=${win}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setStats(null);
      } else {
        setStats(json.data);
      }
    } catch {
      setError("Lỗi kết nối server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const rule = stats ? LOTTERY_RULES[stats.lotteryType] : LOTTERY_RULES[selectedType];
  const maxHotCount = Math.max(...(stats?.trend.hot ?? []).map((s) => s.count), 1);
  const maxColdGap = Math.max(...(stats?.trend.cold ?? []).map((s) => s.gap), 1);
  const bestPairs = stats ? topPairs(stats.pairs, 5) : [];

  return (
    <>
      <div className="warning-banner" role="alert">
        Toàn bộ số liệu dưới đây chỉ là <strong>thống kê mô tả quá khứ</strong>.
        Xổ số Vietlott là <strong>ngẫu nhiên hoàn toàn</strong> — mỗi kỳ quay độc
        lập. <strong>Không có số nào đảm bảo trúng.</strong> 18+, chơi có trách
        nhiệm.
      </div>

      <h1 className="page-title">📊 Thống kê nâng cao</h1>

      <TypeSelector
        selected={selectedType}
        onSelect={(t) => fetchStats(t, windowSize)}
      />

      {loading ? (
        <div className="card" aria-busy="true" aria-label="Đang tải thống kê">
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" style={{ marginTop: "var(--space-4)" }} />
        </div>
      ) : error ? (
        <div className="card">
          <p className="error-text" role="alert">{error}</p>
          <div className="text-center">
            <button className="btn" onClick={() => fetchStats(selectedType, windowSize)}>
              🔄 Thử lại
            </button>
          </div>
        </div>
      ) : stats && stats.totalDraws > 0 ? (
        <>
          {/* 1. Tần suất đầy đủ 45/55 số */}
          <section className="card card-accent" aria-label="Biểu đồ tần suất">
            <div className="card-header">
              <h2>Tần suất toàn bộ {rule.maxNumber} số</h2>
              <span className="badge badge-neutral">
                {stats.totalDraws} kỳ gần nhất
              </span>
            </div>
            <FrequencyChart stats={stats.frequency} />
          </section>

          {/* 2. Tổng bộ số theo kỳ */}
          {stats.sumStats && stats.sumStats.points.length > 0 && (
            <section className="card" aria-label="Biểu đồ tổng bộ số">
              <div className="card-header">
                <h2>📈 Tổng bộ số theo kỳ</h2>
                <span className="badge badge-neutral">
                  {stats.sumStats.points.length} kỳ gần nhất
                </span>
              </div>
              <p className="text-xs-muted" style={{ marginBottom: "var(--space-3)" }}>
                Điểm xanh = bộ có đa số chẵn, đỏ = đa số lẻ. Tổng trung bình:{" "}
                <strong>{stats.sumStats.avg}</strong> (biên lý thuyết{" "}
                {stats.sumStats.theoreticalMin}–{stats.sumStats.theoreticalMax}).
                Chỉ là mô tả quá khứ — mọi bộ số cùng xác suất.
              </p>
              <SumTrendChart points={stats.sumStats.points} />
            </section>
          )}

          {/* 3. Ma trận cặp số */}
          <section className="card" aria-label="Heatmap cặp số">
            <div className="card-header">
              <h2>🔥 Ma trận cặp số cùng xuất hiện</h2>
              <span className="badge badge-neutral">
                {stats.pairs.length} cặp có dữ liệu
              </span>
            </div>
            <p className="text-xs-muted" style={{ marginBottom: "var(--space-3)" }}>
              Ô (i, j) càng đậm → hai số i, j đồng xuất hiện càng nhiều lần trong{" "}
              {stats.totalDraws} kỳ. Di chuột lên ô để xem số lần.
            </p>
            <PairHeatmap
              minNumber={rule.minNumber}
              maxNumber={rule.maxNumber}
              pairs={stats.pairs}
              maxCount={stats.maxPairCount}
            />

            {bestPairs.length > 0 && (
              <div className="muted-box" style={{ marginTop: "var(--space-4)" }}>
                🤝 <strong>Cặp đồng xuất hiện nhiều nhất:</strong>{" "}
                {bestPairs.map((p) => (
                  <span key={`${p.a}-${p.b}`}>
                    {" "}
                    <strong>
                      ({p.a}, {p.b})
                    </strong>{" "}
                    — {p.count} lần;
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* 4. Xu hướng nóng/lạnh theo cửa sổ 10/20/50 kỳ */}
          <section className="card" aria-label="Xu hướng nóng lạnh">
            <div className="card-header">
              <h2>Xu hướng nóng / lạnh</h2>
              <div className="stat-controls">
                <label className="label" htmlFor="trend-window">
                  Khoảng:
                </label>
                <select
                  id="trend-window"
                  className="input input-inline"
                  value={windowSize}
                  onChange={(e) =>
                    fetchStats(selectedType, parseInt(e.target.value, 10))
                  }
                >
                  {TREND_WINDOWS.map((w) => (
                    <option key={w} value={w}>
                      {w} kỳ gần nhất
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <section aria-label="Số nóng gần đây">
                <h3 className="section-title">🔥 Nóng nhất ({stats.window} kỳ)</h3>
                <ul className="stat-list">
                  {stats.trend.hot.map((s) => (
                    <StatBar
                      key={`hot-${s.number}`}
                      number={s.number}
                      value={s.count}
                      max={maxHotCount}
                      tone="hot"
                      valueLabel={`${s.count}/${stats.window} kỳ`}
                    />
                  ))}
                </ul>
              </section>
              <section aria-label="Số lạnh gần đây">
                <h3 className="section-title">❄️ Lạnh nhất ({stats.window} kỳ)</h3>
                <ul className="stat-list">
                  {stats.trend.cold.map((s) => (
                    <StatBar
                      key={`cold-${s.number}`}
                      number={s.number}
                      value={s.gap}
                      max={maxColdGap}
                      tone="cold"
                      valueLabel={`${s.count} lần — gap ${s.gap}`}
                    />
                  ))}
                </ul>
              </section>
            </div>
          </section>
        </>
      ) : (
        <div className="card text-center">
          <p className="text-muted">
            Chưa có dữ liệu để thống kê — hãy đồng bộ từ trang chủ.
          </p>
          <p style={{ marginTop: "var(--space-3)" }}>
            <Link href="/" className="btn">🔄 Về trang chủ để đồng bộ</Link>
          </p>
        </div>
      )}
    </>
  );
}
