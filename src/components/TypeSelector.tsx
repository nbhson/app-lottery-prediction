/**
 * TypeSelector — dải pill chọn loại hình xổ số (Mega 6/45, Power 6/55).
 * Lặp ở 5 trang trước đây — giờ gom về một chỗ.
 */
"use client";

import { LOTTERY_RULES, LotteryType } from "@/types/lottery";

export default function TypeSelector({
  selected,
  onSelect,
  ariaLabel = "Loại hình xổ số",
}: {
  selected: LotteryType;
  onSelect: (type: LotteryType) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="type-selector" role="tablist" aria-label={ariaLabel}>
      {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
        <button
          key={key}
          role="tab"
          aria-selected={selected === key}
          className={`type-btn${selected === key ? " active" : ""}`}
          onClick={() => onSelect(key as LotteryType)}
        >
          {rule.nameVi}
        </button>
      ))}
    </div>
  );
}
