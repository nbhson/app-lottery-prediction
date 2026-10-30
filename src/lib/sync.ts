/**
 * Sync Scheduler — Đồng bộ dữ liệu tự động từ nguồn Vietlott
 * ============================================================
 * Enterprise features:
 * - Sync khi khởi động app (startAutoSync — gọi từ src/instrumentation.ts)
 * - Đồng bộ theo chu kỳ (setInterval) — không chặn request
 * - Backfill lịch sử: DB thiếu dữ liệu → scrape 1 trang winning-number
 *   chứa TOÀN BỘ lịch sử (1 request, hàng nghìn kỳ) — đã xác minh 30/10/2026
 * - Sync log đầy đủ (bảng sync_log)
 * - Chống trùng lặp: INSERT OR IGNORE với UNIQUE(draw_number, lottery_type)
 * - Khóa chống chạy song song: in-process flag + khóa liên tiến trình
 *     qua bản ghi sync_log RUNNING (nhiều instance cùng chạy vẫn an toàn)
 */

import { getConfig } from "@/lib/config";
import {
  scrapeLatest,
  scrapeHistory,
  scrapeDrawDetail,
} from "@/lib/sources/vietlott-en-scraper";
import {
  upsertDraw,
  insertDrawsMany,
  getLatestDraw,
  getOldestDraw,
  countDraws,
  hasRecentRunningSync,
  setSyncStatus,
  startSyncLog,
  finishSyncLog,
  getSyncLogs,
  updateJackpotIfMissing,
} from "@/lib/db";
import { gradePredictionsForNewDraw } from "@/lib/accuracy";
import { LotteryType } from "@/types/lottery";

/** Kết quả một lần sync */
export interface SyncResult {
  success: boolean;
  lotteryType: LotteryType;
  inserted: number;
  skipped: number;
  /** Số kỳ chèn thêm từ backfill lịch sử (nếu có chạy) */
  backfilled: number;
  error?: string;
  durationMs: number;
}

/** Kết quả sync toàn bộ (cả 2 loại hình) */
export interface SyncAllResult {
  results: SyncResult[];
  totalInserted: number;
  totalSkipped: number;
  totalBackfilled: number;
  anyError: boolean;
  durationMs: number;
}

const ALL_TYPES: readonly LotteryType[] = ["MEGA_645", "POWER_655"];

/** Số kỳ tối thiểu trong DB trước khi coi là "đủ dữ liệu" cho thống kê/dự đoán */
export const BACKFILL_TARGET = 120;

/** Bản ghi RUNNING quá stale (phút) sẽ bị coi là chết — không chặn sync mới */
const RUNNING_STALE_MINUTES = 10;

/** In-flight dedup trong cùng process */
let syncInFlight = false;

/** Chống backfill cùng loại hình chạy song song trong 1 process */
const backfillInFlight = new Set<LotteryType>();

/** Pause giữa các request backfill chain — scrape lịch sự với nguồn (ms) */
const BACKFILL_REQUEST_DELAY_MS = 300;

/** Số lỗi liên tiếp tối đa trong chain trước khi dừng backfill */
const BACKFILL_MAX_MISSES = 3;

/**
 * Đồng bộ kết quả mới nhất cho 1 loại hình.
 * Flow: scrape kỳ mới nhất → upsert (chống trùng) → nếu DB còn thiếu dữ liệu
 * (< BACKFILL_TARGET kỳ) → backfill từ trang lịch sử → update sync status.
 */
export async function syncLotteryType(
  lotteryType: LotteryType
): Promise<SyncResult> {
  const startedAt = Date.now();
  const logHandle = startSyncLog("vietlott_en");

  try {
    const result = await scrapeLatest(lotteryType);

    if (!result.success || !result.data) {
      const error = result.error ?? "Unknown scrape error";
      finishSyncLog({
        logId: logHandle.id,
        status: "FAILED",
        recordsAdded: 0,
        errorMessage: error,
      });
      return {
        success: false,
        lotteryType,
        inserted: 0,
        skipped: 0,
        backfilled: 0,
        error,
        durationMs: Date.now() - startedAt,
      };
    }

    const draw = result.data;

    // Dedupe: nếu DB đã có kỳ mới hơn → skip
    const existing = getLatestDraw(lotteryType);
    if (
      existing &&
      (existing.drawNumber === draw.drawNumber ||
        existing.drawDate >= draw.drawDate)
    ) {
      // Tích lũy jackpot: kỳ đã có trong DB (backfill) nhưng jackpot = 0 —
      // scrapeLatest là nguồn duy nhất có giá trị này
      updateJackpotIfMissing(draw.drawNumber, lotteryType, draw.jackpot);
      setSyncStatus({
        connected: true,
        source: "vietlott.vn (EN)",
        note: "Đồng bộ tự động — dữ liệu đã cập nhật",
      });
      finishSyncLog({
        logId: logHandle.id,
        status: "SUCCESS",
        recordsAdded: 0,
      });
      return {
        success: true,
        lotteryType,
        inserted: 0,
        skipped: 1,
        backfilled: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // Upsert — trùng lặp thì bị ignore (do UNIQUE key)
    const { inserted } = upsertDraw({
      drawNumber: draw.drawNumber,
      lotteryType: draw.lotteryType,
      drawDate: draw.drawDate,
      numbers: draw.numbers,
      bonusNumber: draw.bonusNumber,
      jackpot: draw.jackpot,
      published: draw.published,
    });

    // Kỳ đã tồn tại (chèn trước đó bởi backfill, jackpot = 0) → tích lũy jackpot
    if (!inserted) {
      updateJackpotIfMissing(draw.drawNumber, lotteryType, draw.jackpot);
    }

    // Accuracy tracking: kỳ MỚI được chèn → chấm các dự đoán đang chờ
    // (backfill các kỳ cũ có after_draw_date >= drawDate nên không bị chấm nhầm)
    if (inserted) {
      gradePredictionsForNewDraw(lotteryType, draw);
    }

    setSyncStatus({
      connected: true,
      source: "vietlott.vn (EN)",
      note: "Đồng bộ tự động từ website chính thức Vietlott",
    });

    finishSyncLog({
      logId: logHandle.id,
      status: "SUCCESS",
      recordsAdded: inserted ? 1 : 0,
    });

    // Backfill: DB còn thiếu dữ liệu → lấy toàn bộ lịch sử (1 request)
    let backfilled = 0;
    if (countDraws(lotteryType) < BACKFILL_TARGET) {
      backfilled = Math.max(0, await backfillHistory(lotteryType));
    }

    return {
      success: true,
      lotteryType,
      inserted: inserted ? 1 : 0,
      skipped: inserted ? 0 : 1,
      backfilled,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";
    finishSyncLog({
      logId: logHandle.id,
      status: "FAILED",
      recordsAdded: 0,
      errorMessage: message,
    });
    return {
      success: false,
      lotteryType,
      inserted: 0,
      skipped: 0,
      backfilled: 0,
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Backfill lịch sử cho 1 loại hình (chạy khi DB thiếu dữ liệu — < BACKFILL_TARGET kỳ).
 *
 * Chiến lược 2 bước, đã xác minh với nguồn thật 30/10/2026:
 * 1. Trang winning-number: 1 request cho 8 kỳ gần nhất (rẻ, nhanh)
 * 2. Chain ajaxpro: từ kỳ cũ nhất trong DB, scrape lần lượt kỳ trước đó
 *    qua previousDrawId cho tới khi đủ BACKFILL_TARGET kỳ hoặc hết lịch sử.
 *
 * Có pause giữa các request (BACKFILL_REQUEST_DELAY_MS) — scrape lịch sự.
 *
 * @returns tổng số kỳ chèn mới, -1 khi scrape lịch sử thất bại
 */
export async function backfillHistory(
  lotteryType: LotteryType
): Promise<number> {
  if (backfillInFlight.has(lotteryType)) return 0;
  backfillInFlight.add(lotteryType);

  const logHandle = startSyncLog("vietlott_backfill");
  try {
    let inserted = 0;

    // Bước 1: trang lịch sử (8 kỳ gần nhất)
    const history = await scrapeHistory(lotteryType);
    if (!history.success || !history.draws) {
      finishSyncLog({
        logId: logHandle.id,
        status: "FAILED",
        recordsAdded: 0,
        errorMessage: history.error ?? "Unknown history scrape error",
      });
      return -1;
    }
    inserted += insertDrawsMany(history.draws);

    // Bước 2: chain ajaxpro — scrape lần lượt kỳ trước đó từ kỳ cũ nhất trong DB
    let nextId = getOldestDraw(lotteryType)?.drawNumber.match(/-(\d+)$/)?.[1];
    let misses = 0;
    while (
      countDraws(lotteryType) < BACKFILL_TARGET &&
      misses < BACKFILL_MAX_MISSES
    ) {
      if (!nextId) break; // hết lịch sử hoặc không xác định được kỳ trước

      const detail = await scrapeDrawDetail(lotteryType, nextId);
      if (!detail.success || !detail.data) {
        misses++;
        continue;
      }
      misses = 0; // thành công — reset bộ đếm lỗi liên tiếp

      const { inserted: one } = upsertDraw(detail.data);
      inserted += one ? 1 : 0;

      if (!detail.previousDrawId) break; // đã về kỳ đầu tiên trong lịch sử
      nextId = detail.previousDrawId;
      await new Promise((r) => setTimeout(r, BACKFILL_REQUEST_DELAY_MS));
    }

    if (inserted > 0) {
      setSyncStatus({
        connected: true,
        source: "vietlott.vn (EN)",
        note: `Backfill lịch sử: +${inserted} kỳ`,
      });
    }

    finishSyncLog({
      logId: logHandle.id,
      status: "SUCCESS",
      recordsAdded: inserted,
    });
    return inserted;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown backfill error";
    finishSyncLog({
      logId: logHandle.id,
      status: "FAILED",
      recordsAdded: 0,
      errorMessage: message,
    });
    return -1;
  } finally {
    backfillInFlight.delete(lotteryType);
  }
}

/**
 * Đồng bộ tất cả loại hình (Mega 6/45 + Power 6/55).
 * Khóa 2 lớp:
 * 1. In-process flag (chống double-invoke cùng process)
 * 2. hasRecentRunningSync qua sync_log (nhiều process/instance cùng chạy)
 */
export async function syncAll(): Promise<SyncAllResult> {
  const empty: SyncAllResult = {
    results: [],
    totalInserted: 0,
    totalSkipped: 0,
    totalBackfilled: 0,
    anyError: false,
    durationMs: 0,
  };

  if (syncInFlight || hasRecentRunningSync(RUNNING_STALE_MINUTES)) {
    return emptySyncAll();
  }
  syncInFlight = true;
  const startedAt = Date.now();
  try {
    const results: SyncResult[] = [];
    for (const type of ALL_TYPES) {
      results.push(await syncLotteryType(type));
    }
    return {
      results,
      totalInserted: results.reduce((a, r) => a + r.inserted + r.backfilled, 0),
      totalSkipped: results.reduce((a, r) => a + r.skipped, 0),
      totalBackfilled: results.reduce((a, r) => a + r.backfilled, 0),
      anyError: results.some((r) => !r.success),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    syncInFlight = false;
  }
}

/** Kết quả rỗng khi sync bị bỏ qua (đang có sync khác chạy) */
function emptySyncAll(): SyncAllResult {
  return {
    results: [],
    totalInserted: 0,
    totalSkipped: 0,
    totalBackfilled: 0,
    anyError: false,
    durationMs: 0,
  };
}

/**
 * Bật auto-sync theo chu kỳ (gọi 1 lần khi app start — src/instrumentation.ts).
 * Trả về hàm dừng scheduler (dùng cho tests).
 */
export function startAutoSync(): { stop: () => void } {
  const config = getConfig();
  const intervalMs = config.dataSource.syncIntervalMinutes * 60 * 1000;

  // Sync ngay khi khởi động (fire-and-forget — không chặn startup)
  void syncAll().catch(() => {});

  const timer = setInterval(() => {
    // Ghi log lỗi thay vì nuốt im lặng — sync log đã ghi trạng thái FAILED
    // nhưng lỗi có thể xảy ra trước khi startSyncLog chạy
    syncAll().catch((error) => {
      console.error("[sync] Scheduled sync failed:", error);
    });
  }, intervalMs);

  // Không giữ event loop nếu app tắt
  if (typeof timer === "object" && "unref" in timer) {
    (timer as NodeJS.Timeout & { unref?: () => void }).unref?.();
  }

  return { stop: () => clearInterval(timer) };
}

/** Lỗi sync gần nhất (dùng cho /api/sync) */
export function getLastSyncError(): string | null {
  const logs = getSyncLogs(1);
  return logs.length > 0 && logs[0].status !== "SUCCESS"
    ? logs[0].errorMessage ?? "Unknown error"
    : null;
}
