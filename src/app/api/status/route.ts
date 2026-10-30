/**
 * API trạng thái — nguồn dữ liệu + cấu hình AI (không bao giờ trả API key)
 */
import { NextResponse } from "next/server";
import { getDataSourceStatus, getSyncStatus } from "@/lib/db";
import { getAIConfig } from "@/lib/ai/client";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      data: {
        ...getSyncStatus(),
        ai: getAIConfig(),
        dataSourceConfigured: getConfig().dataSource.source,
        syncApiProtected: Boolean(process.env.SYNC_API_TOKEN?.trim()),
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
