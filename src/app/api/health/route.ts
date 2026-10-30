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
import { LotteryType } from "@/types/lottery";

export const dynamic = "force-dynamic";

const ALL_TYPES: readonly LotteryType[] = ["MEGA_645", "POWER_655"];

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
    },
    dataQuality: quality,
    ai: { enabled: getConfig().ai.enabled },
  });
}
