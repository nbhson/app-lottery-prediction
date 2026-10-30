/**
 * API đồng bộ dữ liệu — kích hoạt fetch từ nguồn Vietlott thật
 * GET  ?type=MEGA_645 → sync 1 loại hình
 * POST (không body)   → sync tất cả
 */
import { NextRequest, NextResponse } from "next/server";
import { syncLotteryType, syncAll, getLastSyncError } from "@/lib/sync";
import { getSyncLogs, getSyncStatus } from "@/lib/db";
import { LotteryType } from "@/types/lottery";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic"; // luôn chạy realtime, không cache

/** Per-IP 5 lần/phút + trần tổng 10 lần/phút (mỗi lần kích hoạt scrape nguồn Vietlott). */
const SYNC_RATE_LIMIT = { limit: 5, windowMs: 60_000, globalLimit: 10 };

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(
      "sync",
      request.headers,
      SYNC_RATE_LIMIT.limit,
      SYNC_RATE_LIMIT.windowMs,
      { globalLimit: SYNC_RATE_LIMIT.globalLimit }
    );
    if (rl) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu đồng bộ. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type !== null && type !== "MEGA_645" && type !== "POWER_655") {
      return NextResponse.json(
        { error: `Loại hình không hợp lệ: "${type}". Hợp lệ: MEGA_645, POWER_655` },
        { status: 400 }
      );
    }

    if (type === "MEGA_645" || type === "POWER_655") {
      const result = await syncLotteryType(type);
      return NextResponse.json({ data: result }, { status: result.success ? 200 : 502 });
    }

    const all = await syncAll();
    return NextResponse.json(
      {
        data: all,
        lastError: all.anyError ? getLastSyncError() : null,
      },
      { status: all.anyError ? 207 : 200 }
    );
  } catch (error) {
    console.error("[api/sync] Lỗi đồng bộ:", error);
    return NextResponse.json(
      { error: "Lỗi khi đồng bộ dữ liệu từ nguồn Vietlott" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      status: getSyncStatus(),
      lastError: getLastSyncError(),
      recentLogs: getSyncLogs(10),
    });
  } catch (error) {
    console.error("[api/sync] Lỗi khi đọc sync log:", error);
    return NextResponse.json(
      { error: "Lỗi khi đọc trạng thái đồng bộ" },
      { status: 500 }
    );
  }
}
