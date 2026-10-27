/**
 * Sync Scheduler — Đồng bộ dữ liệu tự động từ nguồn Vietlott
 * ============================================================
 * Enterprise features:
 * - Sync khi khởi động app (ngay khi gọi startAutoSync)
 * - Đồng bộ theo chu kỳ (setInterval) — không chặn request
 * - Sync log đầy đủ (bảng sync_log)
 * - Chống trùng lặp (INSERT OR IGNORE qua upsertDraw với UNIQUE key)
 * - Đếm số record mới thêm
 */

import { getConfig } from "@/lib/config";
import { scrapeLatest } from "@/lib/sources/vietlott-en-scraper";
import {
  upsertDraw,
  getLatestDraw,
  setSyncStatus,
  startSyncLog,
  finishSyncLog,
  getSyncLogs,
  countDraws,
} from "@/lib/db";
import { LotteryType } from "@/types/lottery";

/** Kết quả một lần sync */
export interface SyncResult {
  success: boolean;
  lotteryType: LotteryType;
  inserted: number;
  skipped: number;
  error?: string;
  durationMs: number;
}

/** Kết quả sync toàn bộ (cả 2 loại hình) */
export interface SyncAllResult {
  results: SyncResult[];
  totalInserted: number;
  totalSkipped: number;
  anyError: boolean;
  durationMs: number;
}

const ALL_TYPES: LotteryType[] = ["MEGA_645", "POWER_655"];

/** In-flight dedup: chống chạy sync song song trong cùng process */
let syncInFlight = false;

function totalRecordCount(): number {
  return countDraws("MEGA_645") + countDraws("POWER_655");
}

/**
 * Đồng bộ kết quả mới nhất cho 1 loại hình.
 * Flow: scrape → validate (scraper) → upsert (chống trùng) → update sync status.
 */
export async function syncLotteryType(
  lotteryType: LotteryType
): Promise<SyncResult> {
  const startedAt = Date.now();
  const logHandle = startSyncLog("vietlott_en");

  try {
    const result = await scrapeLatest(lotteryType);

    if (!result.success || !result.data) {
      finishSyncLog({
        logId: logHandle.id,
        status: "FAILED",
        recordsAdded: 0,
        errorMessage: result.error ?? "Unknown scrape error",
      });
      return {
        success: false,
        lotteryType,
        inserted: 0,
        skipped: 0,
        error: result.error,
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

    return {
      success: true,
      lotteryType,
      inserted: inserted ? 1 : 0,
      skipped: inserted ? 0 : 1,
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
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Đồng bộ tất cả loại hình (Mega 6/45 + Power 6/55)
 */
export async function syncAll(): Promise<SyncAllResult> {
  if (syncInFlight) {
    return {
      results: [],
      totalInserted: 0,
      totalSkipped: 0,
      anyError: false,
      durationMs: 0,
    };
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
      totalInserted: results.reduce((a, r) => a + r.inserted, 0),
      totalSkipped: results.reduce((a, r) => a + r.skipped, 0),
      anyError: results.some((r) => !r.success),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    syncInFlight = false;
  }
}

/**
 * Bật auto-sync theo chu kỳ (gọi 1 lần khi app start).
 * Trả về hàm dừng scheduler (dùng cho tests).
 */
export function startAutoSync(): { stop: () => void } {
  const config = getConfig();
  const intervalMs = config.dataSource.syncIntervalMinutes * 60 * 1000;

  // Sync ngay khi khởi động
  void syncAll();

  const timer = setInterval(() => {
    void syncAll();
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
