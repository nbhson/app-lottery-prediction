/**
 * GET /api/draws/export — xuất lịch sử kết quả ra file CSV.
 * - Query: type (MEGA_645 | POWER_655), limit (mặc định 500, chặn tối đa 500)
 * - Trả CSV UTF-8 (có BOM để Excel hiển thị tiếng Việt đúng)
 * - Content-Disposition: attachment
 */
import { NextRequest, NextResponse } from "next/server";
import { getDrawHistory } from "@/lib/db";
import { parseLotteryTypeParam } from "@/lib/validate";

const MAX_EXPORT = 500;

/** Escape 1 field CSV: bọc quote khi chứa dấu phẩy/quote/xuống dòng */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = parseLotteryTypeParam(searchParams.get("type"));
    if (!type) {
      return NextResponse.json(
        { error: 'Loại hình không hợp lệ. Hợp lệ: "MEGA_645", "POWER_655"' },
        { status: 400 }
      );
    }

    const requested = parseInt(searchParams.get("limit") ?? "500", 10);
    const limit =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, MAX_EXPORT)
        : MAX_EXPORT;

    const draws = getDrawHistory(type, limit, 0);

    const header = "draw_number,lottery_type,draw_date,numbers,bonus_number,jackpot";
    const lines = draws.map((d) =>
      [
        d.drawNumber,
        d.lotteryType,
        d.drawDate,
        csvEscape(d.numbers.join(" ")),
        d.bonusNumber ?? "",
        String(d.jackpot),
      ].join(",")
    );
    const csv = "\uFEFF" + [header, ...lines].join("\n");

    const filename = `vietlott-${type.toLowerCase()}-latest${draws.length}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting draws CSV:", error);
    return NextResponse.json(
      { error: "Lỗi khi xuất CSV lịch sử kết quả" },
      { status: 500 }
    );
  }
}
