/**
 * Trang thống kê nâng cao — Server Component:
 * tính payload qua stats-service (dùng chung với /api/stats, có cache TTL)
 * và render ngay lần đầu. Phần tương tác (đổi loại hình/khoảng) ở StatsClient.
 */
import { TREND_WINDOWS } from "@/lib/prediction";
import { computeStatsPayload } from "@/lib/stats-service";
import { parseLotteryTypeParam } from "@/lib/validate";
import StatsClient from "@/components/StatsClient";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; window?: string }>;
}) {
  const sp = await searchParams;
  const type = parseLotteryTypeParam(sp.type ?? null) ?? "MEGA_645";
  const windowParam = parseInt(sp.window ?? "20", 10);
  const window = (TREND_WINDOWS as readonly number[]).includes(windowParam)
    ? windowParam
    : 20;

  let payload;
  try {
    payload = computeStatsPayload(type, window);
  } catch {
    payload = null;
  }

  if (!payload) {
    // DB lỗi — hiển thị thông báo, StatsClient có thể retry bằng fetch API
    return (
      <>
        <h1 className="page-title">📊 Thống kê nâng cao</h1>
        <div className="card">
          <p className="error-text" role="alert">
            Lỗi khi truy vấn dữ liệu thống kê. Vui lòng thử lại.
          </p>
        </div>
      </>
    );
  }

  return <StatsClient initialData={payload.data} initialWindow={window} />;
}
