/**
 * FrequencyChart — bar chart SVG thuần hiển thị tần suất toàn bộ 45/55 số.
 * - Sort: theo số tăng dần / tần suất giảm dần / tần suất tăng dần
 * - Tooltip khi hover: rect + text ẩn/hiện bằng CSS (:hover), kèm <title> a11y
 * - Trục + grid line đơn giản, nhãn xoay dọc cho gọn
 */
"use client";

import { useMemo, useState } from "react";
import { FrequencyStats } from "@/types/lottery";

type SortMode = "number" | "count-desc" | "count-asc";

const SORT_LABELS: Record<SortMode, string> = {
  number: "Theo số (1 → N)",
  "count-desc": "Tần suất giảm dần",
  "count-asc": "Tần suất tăng dần",
};

const WIDTH = 900;
const HEIGHT = 260;
const PAD = { top: 16, right: 8, bottom: 34, left: 34 };

export default function FrequencyChart({ stats }: { stats: FrequencyStats[] }) {
  const [sortMode, setSortMode] = useState<SortMode>("number");

  const { bars, maxCount } = useMemo(() => {
    const sorted = [...stats].sort((a, b) => {
      if (sortMode === "number") return a.number - b.number;
      if (sortMode === "count-desc") return b.count - a.count || a.number - b.number;
      return a.count - b.count || a.number - b.number;
    });
    const max = Math.max(...stats.map((s) => s.count), 1);
    return { bars: sorted, maxCount: max };
  }, [stats, sortMode]);

  const n = bars.length || 1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / n;
  const barW = Math.max(2, slot * 0.72);
  const yFor = (count: number) =>
    PAD.top + innerH * (1 - count / maxCount);
  // Nhãn trục Y: 0, max/2, max (làm tròn lên)
  const yTicks = [0, Math.round(maxCount / 2), maxCount];

  return (
    <div>
      <div className="chart-toolbar">
        <label className="label" htmlFor="freq-sort">
          Sắp xếp:
        </label>
        <select
          id="freq-sort"
          className="input input-inline"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs-muted">Di chuột lên cột để xem chi tiết</span>
      </div>

      <div className="chart-scroll" role="img" aria-label="Biểu đồ tần suất các số">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          {/* Grid + nhãn trục Y */}
          {yTicks.map((t) => {
            const y = yFor(t);
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                  className="chart-grid"
                />
                <text x={PAD.left - 6} y={y + 4} className="chart-axis" textAnchor="end">
                  {t}
                </text>
              </g>
            );
          })}
          {/* Trục X */}
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            className="chart-axis-line"
          />

          {bars.map((s, idx) => {
            const x = PAD.left + idx * slot + (slot - barW) / 2;
            const y = yFor(s.count);
            const h = PAD.top + innerH - y;
            const tipX = x + barW / 2;
            return (
              <g key={s.number} className="chart-bar">
                <title>{`Số ${s.number}: ${s.count} lần — gap ${s.gap} kỳ`}</title>
                <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx={2} />
                <text
                  x={tipX}
                  y={HEIGHT - PAD.bottom + 14}
                  className="chart-axis chart-axis-num"
                  textAnchor="end"
                  transform={`rotate(-90 ${tipX} ${HEIGHT - PAD.bottom + 14})`}
                >
                  {s.number}
                </text>
                {/* Tooltip (ẩn, hiện khi hover qua CSS) */}
                <g className="chart-tooltip" pointerEvents="none">
                  <rect
                    x={Math.min(Math.max(tipX - 52, PAD.left), WIDTH - PAD.right - 104)}
                    y={Math.max(y - 40, 2)}
                    width={104}
                    height={30}
                    rx={6}
                  />
                  <text
                    x={Math.min(Math.max(tipX, PAD.left + 52), WIDTH - PAD.right - 52)}
                    y={Math.max(y - 40, 2) + 19}
                    textAnchor="middle"
                  >
                    #{s.number} · {s.count} lần
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
