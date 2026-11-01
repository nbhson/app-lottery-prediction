/**
 * GET /api/health — health check cho monitoring/load balancer
 *
 * Kiểm tra: DB truy cập được + đếm được records, quality audit từng loại hình,
 * trạng thái sync gần nhất, AI enabled. KHÔNG lộ đường dẫn DB/API key.
 *
 * Response: 200 khi healthy, 503 khi DB không truy cập được,
 * kèm status "degraded" khi data quality có vấn đề ERROR.
 */
import { NextResponse } from "next/server";
import { getDb, countDraws, getSyncStatus } from "@/lib/db";
import { auditDataQuality } from "@/lib/data-quality";
import { getConfig } from "@/lib/config";
import { parseUtcTimestamp } from "@/lib/format";
import { LotteryType } from "@/types/lottery";

export const dynamic = "force-dynamic";

const ALL_TYPES: readonly LotteryType[] = ["MEGA_645", "POWER_655"];

/**
 * Ngưỡng tuổi sync (ms) — vượt ngưỡng coi là sync stale.
 * Mặc định 2× chu kỳ sync, tối thiểu 30 phút.
 */
const SYNC_STALE_FACTOR = 2;
const SYNC_STALE_MIN_MS = 30 * 60_000;

/** Throttle console.warn sync stale — tối đa 1 lần/15 phút (health bị poll thường xuyên) */
let lastStaleWarnAt = 0;
const STALE_WARN_INTERVAL_MS = 15 * 60_000;

export async function GET() {
  const startedAt = Date.now();

  // 1. DB liveness — không truy cập được → 503 ngay
  try {
    getDb().prepare("SELECT 1").get();
  } catch (error) {
    console.error("[api/health] DB không truy cập được:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Database không truy cập được",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }

  // 2. Data quality audit từng loại hình
  const quality: Record<
    string,
    { status: string; totalDraws: number; issues: number }
  > = {};
  let hasDegraded = false;
  for (const type of ALL_TYPES) {
    try {
      const report = auditDataQuality(type);
      quality[type] = {
        status: report.status,
        totalDraws: report.totalDraws,
        issues: report.issues.length,
      };
      if (report.status === "DEGRADED") hasDegraded = true;
    } catch {
      quality[type] = { status: "UNKNOWN", totalDraws: 0, issues: 0 };
      hasDegraded = true;
    }
  }

  // 3. Sync status + draw counts (không throw vì DB đã OK)
  const syncStatus = getSyncStatus();
  const draws: Record<string, number> = {};
  for (const type of ALL_TYPES) {
    draws[type] = countDraws(type);
  }

  // Sync age: cảnh báo khi dữ liệu stale (lastSync quá cũ so với chu kỳ sync).
  // lastSync lưu UTC naive "YYYY-MM-DD HH:MM:SS" → parse theo UTC.
  let syncAgeMinutes: number | null = null;
  let syncStale = false;
  if (syncStatus.lastSync) {
    const lastSyncMs = parseUtcTimestamp(syncStatus.lastSync).getTime();
    if (Number.isFinite(lastSyncMs)) {
      const ageMs = Math.max(0, Date.now() - lastSyncMs);
      syncAgeMinutes = Math.round(ageMs / 60_000);
      const staleThresholdMs = Math.max(
        SYNC_STALE_MIN_MS,
        SYNC_STALE_FACTOR *
          getConfig().dataSource.syncIntervalMinutes *
          60_000
      );
      syncStale = ageMs > staleThresholdMs;
      if (syncStale && Date.now() - lastStaleWarnAt > STALE_WARN_INTERVAL_MS) {
        lastStaleWarnAt = Date.now();
        console.warn(
          `[api/health] Sync stale: lần sync cuối ${syncStatus.lastSync} ` +
            `(UTC) đã ${syncAgeMinutes} phút trước — vượt ngưỡng ` +
            `${Math.round(staleThresholdMs / 60_000)} phút. ` +
            "Kiểm tra scheduler sync / nguồn vietlott.vn."
        );
      }
    }
  }

  return NextResponse.json({
    status: hasDegraded ? "degraded" : "ok",
    uptimeSeconds: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    database: { ok: true },
    draws,
    sync: {
      connected: syncStatus.connected,
      lastSync: syncStatus.lastSync,
      source: syncStatus.source,
      syncAgeMinutes,
      syncStale,
    },
    dataQuality: quality,
    ai: { enabled: getConfig().ai.enabled },
  });
}
