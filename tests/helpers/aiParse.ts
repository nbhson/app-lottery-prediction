/**
 * Helpers cho tests — gọi parser scraper đã export
 */
import { parseMega645, parsePower655 } from "../../src/lib/sources/vietlott-en-scraper";

export function parseAIPredictionShape(
  content: string
): { numbers: number[]; reasoning: string } | null {
  try {
    const cleaned = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    const json = JSON.parse(cleaned.substring(start, end)) as {
      numbers?: unknown;
      reasoning?: unknown;
    };
    if (!Array.isArray(json.numbers)) return null;
    return {
      numbers: (json.numbers as unknown[])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n)),
      reasoning: String(json.reasoning ?? ""),
    };
  } catch {
    return null;
  }
}

export function parseMega645ForTest(html: string): {
  success: boolean;
  data?: { lotteryType: string; numbers: number[]; bonusNumber?: number };
  error?: string;
} {
  const r = parseMega645(html);
  if (!r.success || !r.data) return { success: false, error: r.error };
  return {
    success: true,
    data: {
      lotteryType: r.data.lotteryType,
      numbers: r.data.numbers,
      bonusNumber: r.data.bonusNumber,
    },
  };
}

export function parsePower655ForTest(html: string): {
  success: boolean;
  data?: { lotteryType: string; numbers: number[]; bonusNumber?: number };
  error?: string;
} {
  const r = parsePower655(html);
  if (!r.success || !r.data) return { success: false, error: r.error };
  return {
    success: true,
    data: {
      lotteryType: r.data.lotteryType,
      numbers: r.data.numbers,
      bonusNumber: r.data.bonusNumber,
    },
  };
}
