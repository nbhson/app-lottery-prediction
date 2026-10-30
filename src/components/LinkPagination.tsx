/**
 * LinkPagination — phân trang Server Component bằng Link (URL là nguồn truth).
 * Trang được render lại trên server khi đổi trang → URL chia sẻ được.
 */
import Link from "next/link";

export default function LinkPagination({
  page,
  limit,
  total,
  basePath,
  params,
  label = "kỳ",
}: {
  page: number; // 0-based
  limit: number;
  total: number;
  /** Ví dụ "/history" */
  basePath: string;
  /** Param giữ nguyên giữa các trang (vd: type) */
  params: Record<string, string>;
  label?: string;
}) {
  const totalPages = Math.ceil(total / limit);
  const rangeText =
    total > 0
      ? `Hiển thị ${page * limit + 1}–${Math.min((page + 1) * limit, total)} của ${total} ${label}`
      : `0 ${label}`;

  const hrefFor = (p: number) => {
    const search = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${search.toString()}`;
  };

  return (
    <nav className="pagination" aria-label="Phân trang">
      <span className="text-muted">{rangeText}</span>
      <div className="pagination-controls">
        {page > 0 ? (
          <Link href={hrefFor(page - 1)} className="btn btn-secondary btn-sm">
            ← Trước
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.5 }}>
            ← Trước
          </span>
        )}
        <span className="badge badge-neutral">
          Trang {page + 1}/{totalPages || 1}
        </span>
        {page < totalPages - 1 ? (
          <Link href={hrefFor(page + 1)} className="btn btn-secondary btn-sm">
            Sau →
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled="true" style={{ opacity: 0.5 }}>
            Sau →
          </span>
        )}
      </div>
    </nav>
  );
}
