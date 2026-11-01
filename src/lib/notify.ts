/**
 * Notify — Cảnh báo sync fail liên tục / sync stale qua webhook
 * ============================================================
 * Feature 15.5 (rút gọn, không E2E):
 * - Đọc env NOTIFY_WEBHOOK_URL. Không set → toàn bộ module là no-op.
 * - Generic webhook: POST JSON { reason, message, app, timestamp }.
 * - Telegram-compatible: URL chứa api.telegram.org → gửi format
 *   Telegram sendMessage { chat_id, text } (chat_id từ query ?chat_id=
 *   của URL hoặc env NOTIFY_TELEGRAM_CHAT_ID).
 * - Kích hoạt:
 *   + backfill/sync FAIL >= 3 lần liên tiếp (recordSyncFailure — gọi từ
 *     src/lib/sync.ts tại các chỗ finishSyncLog status FAILED)
 *   + sync stale quá ngưỡng (notifySyncStale — gọi từ /api/health stale check)
 * - Cooldown tối thiểu 1 lần/giờ theo reason — chống spam webhook.
 *
 * Trạng thái (bộ đếm lỗi + cooldown) lưu in-process: restart process sẽ
 * reset — chấp nhận được cho mục đích alert (không cần bền bỉ).
 */

/** Số lần fail liên tiếp trước khi gửi cảnh báo */
export const SYNC_FAIL_NOTIFY_THRESHOLD = 3;

/** Cooldown giữa 2 notification cùng reason — tối đa 1 lần/giờ */
export const NOTIFY_COOLDOWN_MS = 60 * 60_000;

const APP_NAME = "app-lottery-prediction";

/** Lỗi liên tiếp theo key (vd: "sync:MEGA_645", "backfill:POWER_655") */
const consecutiveFailures = new Map<string, number>();

/** Lần gửi gần nhất theo reason (cooldown) */
const lastNotifiedAt = new Map<string, number>();

/** Reset trạng thái in-process (dùng cho tests) */
export function resetNotifyState(): void {
  consecutiveFailures.clear();
  lastNotifiedAt.clear();
}

/**
 * Gửi 1 notification qua webhook đã cấu hình.
 * Trả về true khi gửi thành công, false khi: không cấu hình env,
 * đang trong cooldown, hoặc webhook lỗi (chỉ log, không throw —
 * notification không được làm crash sync/health check).
 */
export async function sendNotification(
  reason: string,
  message: string
): Promise<boolean> {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return false; // không cấu hình → no-op

  const now = Date.now();
  const last = lastNotifiedAt.get(reason) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false; // cooldown chống spam
  lastNotifiedAt.set(reason, now);

  try {
    const ok = url.includes("api.telegram.org")
      ? await sendTelegram(url, message)
      : await sendGeneric(url, reason, message);
    if (!ok) {
      console.error(`[notify] Webhook trả lỗi khi gửi cảnh báo '${reason}'`);
    }
    return ok;
  } catch (error) {
    console.error(`[notify] Lỗi gửi cảnh báo '${reason}':`, error);
    return false;
  }
}

/** POST JSON đơn giản cho generic webhook */
async function sendGeneric(
  url: string,
  reason: string,
  message: string
): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reason,
      message,
      app: APP_NAME,
      timestamp: new Date().toISOString(),
    }),
  });
  return res.ok;
}

/**
 * Telegram sendMessage — chat_id lấy từ query ?chat_id= của URL hoặc
 * env NOTIFY_TELEGRAM_CHAT_ID. Thiếu chat_id → bỏ qua (log warn).
 */
async function sendTelegram(url: string, message: string): Promise<boolean> {
  let chatId: string | null = null;
  try {
    chatId = new URL(url).searchParams.get("chat_id");
  } catch {
    // URL lỗi — để fetch báo lỗi bên dưới
  }
  chatId = chatId || process.env.NOTIFY_TELEGRAM_CHAT_ID?.trim() || null;
  if (!chatId) {
    console.warn(
      "[notify] Webhook Telegram thiếu chat_id (thêm ?chat_id=... vào URL " +
        "hoặc set NOTIFY_TELEGRAM_CHAT_ID) — bỏ qua gửi."
    );
    return false;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  return res.ok;
}

/**
 * Ghi nhận 1 lần sync/backfill FAIL cho `key` (vd: "sync:MEGA_645").
 * Đạt >= SYNC_FAIL_NOTIFY_THRESHOLD lần liên tiếp → gửi cảnh báo
 * (fire-and-forget — không chặn caller, không throw).
 */
export function recordSyncFailure(key: string, error: string): void {
  const count = (consecutiveFailures.get(key) ?? 0) + 1;
  consecutiveFailures.set(key, count);
  if (count < SYNC_FAIL_NOTIFY_THRESHOLD) return;
  const message =
    `[${APP_NAME}] Sync '${key}' FAIL ${count} lần liên tiếp: ${error}. ` +
    `Kiểm tra nguồn dữ liệu Vietlott / logs sync_log.`;
  void sendNotification(`sync-fail:${key}`, message).catch(() => {});
}

/** Ghi nhận sync/backfill SUCCESS cho `key` — reset bộ đếm lỗi liên tiếp */
export function recordSyncSuccess(key: string): void {
  consecutiveFailures.delete(key);
}

/**
 * Cảnh báo sync stale (gọi từ /api/health khi lastSync vượt ngưỡng).
 * Dùng chung cooldown 1 giờ/reason — không spam khi health bị poll liên tục.
 */
export async function notifySyncStale(
  lastSync: string,
  ageMinutes: number,
  thresholdMinutes: number
): Promise<boolean> {
  return sendNotification(
    "sync-stale",
    `[${APP_NAME}] Sync stale: lần sync cuối ${lastSync} (UTC) đã ` +
      `${ageMinutes} phút trước — vượt ngưỡng ${thresholdMinutes} phút. ` +
      `Kiểm tra scheduler sync / nguồn vietlott.vn.`
  );
}
