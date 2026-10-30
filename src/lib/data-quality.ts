/**
 * Data Quality Audit — kiểm tra chất lượng dữ liệu xổ số trong DB
 * ============================================================
 * Enterprise feature: phát hiện sớm dữ liệu bất thường trước khi nó
 * lan vào thống kê/dự đoán. Audit là READ-ONLY, không sửa dữ liệu.
 *
 * Các kiểm tra:
 * - draw_number trùng (UNIQUE của DB phải chặn — phát hiện = lỗi nghiêm trọng)
 * - draw_date trùng trong cùng 1 loại hình (mỗi kỳ chỉ quay 1 ngày)
 * - số ngoài phạm vi / trùng nhau trong 1 kỳ / sai số lượng
 * - đứt chuỗi draw ID (kỳ thiếu giữa 2 kỳ liên tiếp — dấu hiệu backfill thiếu)
 *
 * Status tổng: OK (sạch) | WARN (đứt chuỗi / ngày trùng) | DEGRADED (dữ liệu sai)
 */
import {
  DrawResult,
  LotteryType,
  LOTTERY_RULES,
} from "@/types/lottery";
import { getDrawHistory } from "./db";

export interface DataQualityIssue {
  severity: "WARN" | "ERROR";
  message: string;
}

export interface DataQualityReport {
  lotteryType: LotteryType;
  totalDraws: number;
  oldestDrawDate: string | null;
  newestDrawDate: string | null;
  duplicateDrawNumbers: number;
  duplicateDrawDates: number;
  invalidNumberRows: number;
  sequenceGaps: number;
  /** Ví dụ các kỳ bị thiếu trong chuỗi (tối đa 10) */
  gapDrawNumbers: string[];
  issues: DataQualityIssue[];
  status: "OK" | "WARN" | "DEGRADED";
}

/** Số kỳ tối đa đưa vào audit (đủ cho toàn bộ lịch sử 2 loại hình) */
const AUDIT_MAX_DRAWS = 2000;

/** Số kỳ thiếu tối đa liệt kê chi tiết trong report */
const MAX_GAP_EXAMPLES = 10;

/**
 * Tách phần số của drawNumber ("MXSH-01580" → 1580).
 * Trả về null khi format không nhận diện được.
 */
export function extractDrawSeq(drawNumber: string): number | null {
  const m = drawNumber.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Phát hiện đứt chuỗi draw ID từ danh sách (yêu cầu đầu vào tăng dần).
 * Trả về các drawNumber TRƯỚC mỗi chỗ đứt (kỳ i thiếu kỳ i+1).
 */
export function findSequenceGaps(
  sortedAsc: Array<{ drawNumber: string; seq: number }>
): string[] {
  const gaps: string[] = [];
  for (let i = 1; i < sortedAsc.length; i++) {
    const diff = sortedAsc[i].seq - sortedAsc[i - 1].seq;
    if (diff > 1) {
      gaps.push(sortedAsc[i - 1].drawNumber);
      if (gaps.length >= MAX_GAP_EXAMPLES) break;
    }
  }
  return gaps;
}

/** Audit chất lượng dữ liệu cho 1 loại hình — READ-ONLY */
export function auditDataQuality(lotteryType: LotteryType): DataQualityReport {
  const rule = LOTTERY_RULES[lotteryType];
  const draws = getDrawHistory(lotteryType, AUDIT_MAX_DRAWS, 0);
  const issues: DataQualityIssue[] = [];

  // 1. draw_number trùng
  const seenDrawNumbers = new Set<string>();
  let duplicateDrawNumbers = 0;
  for (const d of draws) {
    if (seenDrawNumbers.has(d.drawNumber)) duplicateDrawNumbers++;
    seenDrawNumbers.add(d.drawNumber);
  }
  if (duplicateDrawNumbers > 0) {
    issues.push({
      severity: "ERROR",
      message: `${duplicateDrawNumbers} draw_number trùng lặp — ràng buộc UNIQUE của DB có thể bị bỏ qua`,
    });
  }

  // 2. draw_date trùng (mỗi kỳ chỉ quay 1 ngày)
  const seenDates = new Set<string>();
  let duplicateDrawDates = 0;
  for (const d of draws) {
    if (seenDates.has(d.drawDate)) duplicateDrawDates++;
    seenDates.add(d.drawDate);
  }
  if (duplicateDrawDates > 0) {
    issues.push({
      severity: "WARN",
      message: `${duplicateDrawDates} ngày có nhiều hơn 1 kỳ — kiểm tra nguồn dữ liệu`,
    });
  }

  // 3. Số liệu bất thường trong từng kỳ
  let invalidNumberRows = 0;
  for (const d of draws) {
    const nums = d.numbers;
    const valid =
      nums.length === rule.pickCount &&
      nums.every(
        (n) => Number.isInteger(n) && n >= rule.minNumber && n <= rule.maxNumber
      ) &&
      new Set(nums).size === rule.pickCount;
    if (!valid) invalidNumberRows++;
  }
  if (invalidNumberRows > 0) {
    issues.push({
      severity: "ERROR",
      message: `${invalidNumberRows} kỳ có bộ số sai (sai số lượng / ngoài phạm vi ${rule.minNumber}-${rule.maxNumber} / trùng nhau)`,
    });
  }

  // 4. Đứt chuỗi draw ID (kỳ thiếu giữa các kỳ liên tiếp)
  const withSeq: Array<{ drawNumber: string; seq: number }> = [];
  for (const d of draws) {
    const seq = extractDrawSeq(d.drawNumber);
    if (seq !== null) withSeq.push({ drawNumber: d.drawNumber, seq });
  }
  withSeq.sort((a, b) => a.seq - b.seq);
  const gapDrawNumbers = findSequenceGaps(withSeq);
  const sequenceGaps = gapDrawNumbers.length;
  if (sequenceGaps > 0) {
    issues.push({
      severity: "WARN",
      message: `Phát hiện ${sequenceGaps}+ chỗ đứt chuỗi kỳ (VD: sau ${gapDrawNumbers[0]}) — backfill có thể chưa đủ dữ liệu`,
    });
  }

  const hasError = issues.some((i) => i.severity === "ERROR");
  const status = hasError
    ? "DEGRADED"
    : issues.length > 0
      ? "WARN"
      : "OK";

  return {
    lotteryType,
    totalDraws: draws.length,
    oldestDrawDate: draws.length > 0 ? draws[draws.length - 1].drawDate : null,
    newestDrawDate: draws.length > 0 ? draws[0].drawDate : null,
    duplicateDrawNumbers,
    duplicateDrawDates,
    invalidNumberRows,
    sequenceGaps,
    gapDrawNumbers,
    issues,
    status,
  };
}
