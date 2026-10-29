/**
 * StatBar — một dòng số nóng/lạnh với bar trực quan (grid: số | bar | nhãn).
 * Dùng ở /prediction, /prediction/ai và /stats.
 */
export default function StatBar({
  number,
  value,
  max,
  tone = "hot",
  valueLabel,
}: {
  number: number;
  /** Giá trị chuẩn hóa chiều dài bar (count hoặc gap) */
  value: number;
  /** Max trong nhóm để tính % */
  max: number;
  tone?: "hot" | "cold";
  valueLabel: string;
}) {
  const width = max <= 0 ? 8 : Math.max(8, Math.round((value / max) * 100));
  return (
    <li className="stat-item">
      <span className={`stat-number${tone === "cold" ? " cold" : ""}`}>
        {number}
      </span>
      <span className="stat-bar-track">
        <span
          className={`stat-bar${tone === "cold" ? " cold" : ""}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-muted">{valueLabel}</span>
    </li>
  );
}
