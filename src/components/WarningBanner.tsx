/**
 * WarningBanner — banner cảnh báo dùng chung (18+ / không đảm bảo trúng).
 * tone "warning" (mặc định) hoặc "info". Truyền HTML qua children.
 */
export default function WarningBanner({
  tone = "warning",
  title = "⚠️ Cảnh báo quan trọng:",
  children,
  className = "",
}: {
  tone?: "warning" | "info" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const role = tone === "warning" ? "alert" : "status";
  return (
    <div className={`${tone}-banner${className ? ` ${className}` : ""}`} role={role}>
      <strong>{title}</strong> {children}
    </div>
  );
}
