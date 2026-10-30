/**
 * API đồng bộ dữ liệu — kích hoạt fetch từ nguồn Vietlott thật
 * GET  → xem trạng thái + sync logs
 * POST → sync tất cả (hoặc 1 loại hình qua ?type=)
 *
 * Bảo mật enterprise: nếu cấu hình SYNC_API_TOKEN trong .env, mọi request POST
 * phải kèm header `x-api-token` hoặc `Authorization: Bearer <token>` (so sánh
 * timing-safe). Không cấu hình → mở (dev/single-user, rate limit vẫn bảo vệ).
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { syncLotteryType, syncAll, getLastSyncError } from "@/lib/sync";
import { getSyncLogs, getSyncStatus } from "@/lib/db";
import { LotteryType } from "@/types/lottery";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic"; // luôn chạy realtime, không cache

/** Per-IP 5 lần/phút + trần tổng 10 lần/phút (mỗi lần kích hoạt scrape nguồn Vietlott). */
const SYNC_RATE_LIMIT = { limit: 5, windowMs: 60_000, globalLimit: 10 };

/** So sánh chuỗi secret timing-safe để tránh timing attack */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Kiểm tra quyền kích hoạt sync.
 * SYNC_API_TOKEN chưa cấu hình → cho phép (chế độ dev).
 */
function isSyncAuthorized(request: NextRequest): boolean {
  const expected = process.env.SYNC_API_TOKEN?.trim() ?? "";
  if (!expected) return true;

  const headerToken =
    request.headers.get("x-api-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return headerToken.length > 0 && safeEquals(headerToken, expected);
}

export async function POST(request: NextRequest) {
  try {
    // Auth TRƯỚC rate-limit — kẻ lạ không được đốt trần tổng của route
    if (!isSyncAuthorized(request)) {
      return NextResponse.json(
        { error: "Không có quyền đồng bộ. Cần token hợp lệ." },
        { status: 401 }
      );
    }

    const rl = await checkRateLimit(
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
      syncApiProtected: Boolean(process.env.SYNC_API_TOKEN?.trim()),
    });
  } catch (error) {
    console.error("[api/sync] Lỗi khi đọc sync log:", error);
    return NextResponse.json(
      { error: "Lỗi khi đọc trạng thái đồng bộ" },
      { status: 500 }
    );
  }
}
