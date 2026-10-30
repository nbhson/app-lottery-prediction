/**
 * Trang lịch sử kết quả — Server Component với phân trang qua URL.
 * - Dữ liệu lấy trực tiếp từ SQLite lúc render (force-dynamic)
 * - ?type=MEGA_645|POWER_655&page=0 → URL chia sẻ được, SEO thân thiện
 * - Không còn bước fetch API nội bộ + skeleton khi mở trang
 */
import Link from "next/link";
import { countDraws, getDrawHistory } from "@/lib/db";
import { DrawResult, LotteryType } from "@/types/lottery";
import { parseLotteryTypeParam } from "@/lib/validate";
import DrawTable from "@/components/DrawTable";
import LinkPagination from "@/components/LinkPagination";
import TypeSelectorLinks from "@/components/TypeSelectorLinks";

const LIMIT = 10;

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type = (parseLotteryTypeParam(sp.type ?? null) ?? "MEGA_645") as LotteryType;
  const page = Math.max(0, parseInt(sp.page ?? "0", 10) || 0);

  let draws: DrawResult[] = [];
  let total = 0;
  let dbError = false;
  try {
    draws = getDrawHistory(type, LIMIT, page * LIMIT);
    total = countDraws(type);
  } catch {
    dbError = true;
  }

  return (
    <>
      <h1 style={{ marginBottom: "var(--space-6)" }}>Lịch sử kết quả xổ số</h1>

      <TypeSelectorLinks
        selected={type}
        basePath="/history"
        extraParams={{ page: "0" }}
      />

      {dbError ? (
        <div className="card">
          <p className="error-text" role="alert">
            Lỗi khi truy vấn dữ liệu. Vui lòng thử lại.
          </p>
          <div className="text-center">
            <Link href={`/history?type=${type}&page=${page}`} className="btn">
              🔄 Thử lại
            </Link>
          </div>
        </div>
      ) : draws.length > 0 ? (
        <>
          <div className="card">
            <DrawTable draws={draws} />
          </div>

          <LinkPagination
            page={page}
            limit={LIMIT}
            total={total}
            basePath="/history"
            params={{ type }}
          />
        </>
      ) : (
        <div className="card text-center">
          <p className="text-muted">Chưa có dữ liệu lịch sử.</p>
          <p style={{ marginTop: "var(--space-3)" }}>
            <Link href="/" className="btn">🔄 Về trang chủ để đồng bộ</Link>
          </p>
        </div>
      )}
    </>
  );
}
