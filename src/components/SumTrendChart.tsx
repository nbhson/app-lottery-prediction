/**
 * SumTrendChart — line chart SVG thuần hiển thị tổng bộ số theo kỳ.
 * - Đường tổng + dải min/max lý thuyết làm mốc tham chiếu
 * - Điểm tô màu theo đa số chẵn/lẻ trong bộ (ngưng/ấm)
 * - Tooltip khi hover (CSS :hover) kèm <title> a11y — cùng pattern FrequencyChart
 */
"use client";

import { useMemo } from "react";
import { SumPoint } from "@/types/lottery";

const WIDTH = 900;
const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 30, left: 40 };

export default function SumTrendChart({ points }: { points: SumPoint[] }) {
  const chart = useMemo(() => {
    const n = points.length || 1;
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const min = Math.min(...points.map((p) => p.sum), 1);
    const max = Math.max(...points.map((p) => p.sum), 2);
    // Đệm 5% hai đầu để đường không chạm mép
    const lo = min - (max - min) * 0.05;
    const hi = max + (max - min) * 0.05;
    const xFor = (idx: number) => PAD.left + (innerW * idx) / Math.max(1, n - 1);
    const yFor = (sum: number) => PAD.top + innerH * (1 - (sum - lo) / (hi - lo));
    return { n, innerW, innerH, xFor, yFor, lo, hi };
  }, [points]);

  if (points.length === 0) return null;

  const { xFor, yFor, innerH, lo, hi } = chart;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.sum).toFixed(1)}`)
    .join(" ");
  const yTicks = [Math.round(lo), Math.round((lo + hi) / 2), Math.round(hi)];

  return (
    <div
      className="chart-scroll"
      role="img"
      aria-label="Biểu đồ tổng bộ số theo kỳ"
    >
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

        {/* Đường tổng */}
        <path d={path} className="chart-line" fill="none" />

        {/* Điểm dữ liệu — tô theo đa số chẵn (ngưng) / lẻ (ấm) */}
        {points.map((p, i) => {
          const x = xFor(i);
          const y = yFor(p.sum);
          const majorityEven = p.even >= p.odd;
          return (
            <g key={`${p.drawNumber}-${i}`} className="chart-point">
              <title>
                {`Kỳ #${p.drawNumber} (${p.drawDate}): tổng ${p.sum} — ${p.even} chẵn / ${p.odd} lẻ`}
              </title>
              <circle cx={x} cy={y} r={4} data-tone={majorityEven ? "even" : "odd"} />
              <g className="chart-tooltip" pointerEvents="none">
                <rect
                  x={Math.min(Math.max(x - 60, PAD.left), WIDTH - PAD.right - 120)}
                  y={Math.max(y - 42, 2)}
                  width={120}
                  height={30}
                  rx={6}
                />
                <text
                  x={Math.min(Math.max(x, PAD.left + 60), WIDTH - PAD.right - 60)}
                  y={Math.max(y - 42, 2) + 19}
                  textAnchor="middle"
                >
                  #{p.drawNumber} · Σ{p.sum}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
