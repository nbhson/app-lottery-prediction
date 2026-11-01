/**
 * Formatting helpers dùng chung cho client components.
 */

/**
 * Format draw_date (ISO date-only string "YYYY-MM-DD") theo locale vi-VN.
 *
 * QUAN TRỌNG về múi giờ: `new Date("YYYY-MM-DD")` được JS parse là UTC
 * midnight. Pin `timeZone: "Asia/Ho_Chi_Minh"` (UTC+7) đảm bảo ngày hiển thị
 * luôn trùng với ngày trong DB (00:00 UTC = 07:00 cùng ngày ở VN). Không bao
 * giờ để browser tự chọn timezone — ở máy khách UTC-x ngày sẽ bị lệch -1.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/**
 * Parse mốc thời gian DB (UTC naive "YYYY-MM-DD HH:MM:SS" hoặc ISO có Z)
 * → Date theo UTC. DB lưu UTC chuẩn (datetime('now')) — KHÔNG được để JS
 * parse chuỗi naive theo timezone của server.
 */
export function parseUtcTimestamp(dateStr: string): Date {
  const normalized = dateStr.includes("T")
    ? dateStr
    : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

/**
 * Format mốc thời gian DB (UTC "YYYY-MM-DD HH:MM:SS") thành ngày VN.
 * Dùng cho created_at/last_sync/sync_log — khác draw_date (date-only, dùng
 * formatDate). Parse UTC + pin Asia/Ho_Chi_Minh → hiển thị đúng giờ VN
 * bất kể timezone của server/browser.
 */
export function formatDbDate(dateStr: string): string {
  return parseUtcTimestamp(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** Format tiền VNĐ (jackpot). 0 → "—" (chưa có dữ liệu). */
export function formatVnd(v: number): string {
  if (v === 0) return "—";
  return v.toLocaleString("vi-VN") + " đ";
}
