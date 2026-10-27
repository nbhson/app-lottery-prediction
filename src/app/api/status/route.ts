/**
 * API trạng thái — nguồn dữ liệu + cấu hình AI (không bao giờ trả API key)
 */
import { NextResponse } from "next/server";
import { getDataSourceStatus, getSyncStatus } from "@/lib/db";
import { getAIStatus } from "@/lib/ai/client";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      data: {
        ...getSyncStatus(),
        ai: getAIStatus(),
        dataSourceConfigured: getConfig().dataSource.source,
      },
    });
  } catch (error) {
    console.error("Error fetching data source status:", error);
    return NextResponse.json(
      { error: "Lỗi khi lấy trạng thái nguồn dữ liệu" },
      { status: 500 }
    );
  }
}
