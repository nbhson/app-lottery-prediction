/**
 * TypeSelectorLinks — phiên bản Server Component của TypeSelector:
 * điều hướng bằng Link (query param) thay vì onClick → dùng được cho
 * các trang render server (/history). Có aria-current thay vì aria-selected.
 */
import Link from "next/link";
import { LOTTERY_RULES, LotteryType } from "@/types/lottery";

export default function TypeSelectorLinks({
  selected,
  basePath,
  extraParams,
  ariaLabel = "Loại hình xổ số",
}: {
  selected: LotteryType;
  /** Ví dụ "/history" — type được nối thành ?type= */
  basePath: string;
  /** Các param giữ nguyên khi đổi type (vd: page) */
  extraParams?: Record<string, string>;
  ariaLabel?: string;
}) {
  const buildHref = (type: LotteryType) => {
    const params = new URLSearchParams({ type, ...extraParams });
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="type-selector" role="tablist" aria-label={ariaLabel}>
      {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
        <Link
          key={key}
          role="tab"
          href={buildHref(key as LotteryType)}
          aria-selected={selected === key}
          aria-current={selected === key ? "page" : undefined}
          className={`type-btn${selected === key ? " active" : ""}`}
        >
          {rule.nameVi}
        </Link>
      ))}
    </div>
  );
}
