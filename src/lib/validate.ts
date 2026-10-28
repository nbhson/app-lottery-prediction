/**
 * Validation helpers cho API routes.
 */
import { LOTTERY_RULES, LotteryType } from "@/types/lottery";

/**
 * Parse + validate query param `type`.
 * Trả về LotteryType hợp lệ (mặc định MEGA_645 khi bỏ trống),
 * hoặc null khi giá trị không hợp lệ → route phải trả 400.
 *
 * Fix bug: trước đây route cast thẳng `as LotteryType` rồi truy cập
 * `LOTTERY_RULES[type]` → type lạ gây TypeError → 500 thay vì 400.
 */
export function parseLotteryTypeParam(value: string | null): LotteryType | null {
  const t = (value ?? "MEGA_645") as LotteryType;
  return t in LOTTERY_RULES ? t : null;
}
