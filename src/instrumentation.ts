/**
 * Next.js Instrumentation — hook chạy 1 lần khi server khởi động
 * (dev server, `next start`, deployment). KHÔNG chạy lúc build.
 *
 * Nhiệm vụ: bật auto-sync scheduler (sync ngay khi start + theo chu kỳ
 * DATA_SYNC_INTERVAL_MINUTES). Guard kép để không khởi động 2 lần
 * (dev hot-reload tạo lại module): globalThis flag.
 */
export async function register(): Promise<void> {
  // Chỉ chạy ở runtime Node.js (bỏ qua Edge middleware runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as typeof globalThis & {
    __vietlottAutoSyncStarted?: boolean;
  };
  if (g.__vietlottAutoSyncStarted) return;
  g.__vietlottAutoSyncStarted = true;

  // Import động để không kéo SQLite/native module vào các ngữ cảnh khác
  const { startAutoSync } = await import("@/lib/sync");
  const { stop } = startAutoSync();

  // Dừng scheduler sạch sẽ khi process tắt (tránh timer rò rỉ)
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => stop());
  }
}
