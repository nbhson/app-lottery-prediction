/**
 * LotteryBall — quả bóng số xổ số với animation pop-in.
 * Dùng lại ở mọi trang: trang chủ, lịch sử, dự đoán.
 */
export default function LotteryBall({
  n,
  bonus = false,
  size = "md",
  delay = 0,
}: {
  n: number;
  bonus?: boolean;
  /** "md" (48px) | "sm" (34px) */
  size?: "md" | "sm";
  /** Delay animation (ms) — tạo hiệu ứng pop lần lượt */
  delay?: number;
}) {
  const cls = ["ball", bonus ? "bonus" : "", size === "sm" ? "ball-sm" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={{ animationDelay: `${delay}ms` }}>
      {n.toString().padStart(2, "0")}
    </span>
  );
}
