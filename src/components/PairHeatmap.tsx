/**
 * PairHeatmap — heatmap ma trận cặp số cùng xuất hiện (CSS grid thuần).
 * Ô (hàng i, cột j) đậm dần theo số lần hai số đồng xuất hiện.
 * Màu nền dùng rgba(var(--color-primary-rgb), alpha) — tự thích ứng dark mode.
 */
"use client";

import { useMemo } from "react";
import type { PairStat } from "@/types/lottery";

export default function PairHeatmap({
  maxNumber,
  minNumber,
  pairs,
  maxCount,
}: {
  maxNumber: number;
  minNumber: number;
  pairs: PairStat[];
  maxCount: number;
}) {
  const size = maxNumber - minNumber + 1;
  const numbers = useMemo(
    () => Array.from({ length: size }, (_, i) => i + minNumber),
    [size, minNumber]
  );

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pairs) {
      map.set(`${p.a}-${p.b}`, p.count);
      map.set(`${p.b}-${p.a}`, p.count);
    }
    return map;
  }, [pairs]);

  /** Alpha 0 → 0.85 theo count/max — nền ô theo cường độ đồng xuất hiện */
  const alphaFor = (count: number | undefined): number => {
    if (!count) return 0.05;
    return 0.05 + 0.8 * Math.sqrt(count / Math.max(maxCount, 1));
  };

  return (
    <div>
      <div className="heatmap-scroll">
        <div
          className="heatmap-grid"
          style={{ gridTemplateColumns: `repeat(${size + 1}, minmax(0, 1fr))` }}
          role="img"
          aria-label="Heatmap ma trận cặp số cùng xuất hiện"
        >
          {/* Hàng tiêu đề (cột đầu rỗng) */}
          <span className="heatmap-head" />
          {numbers.map((n) => (
            <span key={`h-${n}`} className="heatmap-head">
              {n}
            </span>
          ))}

          {numbers.map((row) => (
            <HeatmapRow
              key={`r-${row}`}
              row={row}
              numbers={numbers}
              countMap={countMap}
              alphaFor={alphaFor}
            />
          ))}
        </div>
      </div>

      <div className="heatmap-legend" aria-hidden="true">
        <span className="text-xs-muted">Ít</span>
        {[0.08, 0.28, 0.48, 0.68, 0.88].map((a) => (
          <span
            key={a}
            className="heatmap-legend-cell"
            style={{ background: `rgba(var(--color-primary-rgb), ${a})` }}
          />
        ))}
        <span className="text-xs-muted">Nhiều (max {maxCount} lần cùng xuất hiện)</span>
      </div>
    </div>
  );
}

/** Một hàng của heatmap — tách component con để tránh lặp key logic */
function HeatmapRow({
  row,
  numbers,
  countMap,
  alphaFor,
}: {
  row: number;
  numbers: number[];
  countMap: Map<string, number>;
  alphaFor: (count: number | undefined) => number;
}) {
  return (
    <>
      <span className="heatmap-head">{row}</span>
      {numbers.map((col) => {
        const count = row === col ? undefined : countMap.get(`${row}-${col}`);
        return (
          <span
            key={`${row}-${col}`}
            className={`heatmap-cell${row === col ? " heatmap-diag" : ""}`}
            title={
              row === col
                ? `Số ${row}`
                : `(${row}, ${col}): ${count ?? 0} lần cùng xuất hiện`
            }
            style={{ background: `rgba(var(--color-primary-rgb), ${alphaFor(count)})` }}
          />
        );
      })}
    </>
  );
}
