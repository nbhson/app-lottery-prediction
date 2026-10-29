/**
 * Pagination — thanh phân trang (Trước / Trang x/y / Sau) + mô tả khoảng hiển thị.
 * Dùng chung cho /history và các trang có danh sách phân trang.
 */
export default function Pagination({
  page,
  limit,
  total,
  onPageChange,
  label = "kỳ",
}: {
  page: number; // 0-based
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  label?: string;
}) {
  const totalPages = Math.ceil(total / limit);
  const rangeText =
    total > 0
      ? `Hiển thị ${page * limit + 1}–${Math.min((page + 1) * limit, total)} của ${total} ${label}`
      : `0 ${label}`;

  return (
    <nav className="pagination" aria-label="Phân trang">
      <span className="text-muted">
        {rangeText}
      </span>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
        >
          ← Trước
        </button>
        <span className="badge badge-neutral">
          Trang {page + 1}/{totalPages || 1}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          Sau →
        </button>
      </div>
    </nav>
  );
}
