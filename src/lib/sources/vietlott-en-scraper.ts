/**
 * Scraper cho trang English của vietlott.vn
 * ============================================================
 * ĐÃ XÁC MINH (27/10/2026): https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645
 *
 * Cấu trúc HTML chính xác đã quan sát:
 *   <H5>Draw ID <b>#01580</b> Date <b>25/10/2026</b></H5>
 *   <span class="bong_tron">04</span><span class="bong_tron">13</span>...
 *   <h3>16.103.186.000</h3>
 *
 * Các nguồn fallback:
 *   - API nội bộ Vietlott: /ajax-pro/Mega645Controller/getLastResult (POST)
 */

import { DrawResult, LotteryType } from "@/types/lottery";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface ScrapeResult {
  success: boolean;
  data?: DrawResult;
  error?: string;
  previousDrawId?: string; // dùng để scrape tiếp kỳ trước
}

async function fetchWithRetry(
  url: string,
  retries: number = 3,
  delayMs: number = 2000
): Promise<{ ok: boolean; body: string; status: number }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.text();
      return { ok: res.ok, body, status: res.status };
    } catch {
      if (attempt === retries) return { ok: false, body: "", status: 0 };
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  return { ok: false, body: "", status: 0 };
}

async function fetchPostWithRetry(
  url: string,
  body: string,
  retries: number = 3,
  delayMs: number = 2000
): Promise<{ ok: boolean; body: string; status: number }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          Accept: "application/json, text/javascript",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Length": `${Buffer.byteLength(body)}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      return { ok: res.ok, body: text, status: res.status };
    } catch {
      if (attempt === retries) return { ok: false, body: "", status: 0 };
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  return { ok: false, body: "", status: 0 };
}

/**
 * Parse kết quả Mega 6/45 từ HTML — đúng cấu trúc đã xác minh:
 *   Draw ID <b>#01580</b> Date <b>25/10/2026</b>
 *   <span class="bong_tron">04</span><span class="bong_tron">13</span>...
 *   <h3>16.103.186.000</h3>
 */
/** Parse Mega 6/45 từ HTML — export cho unit tests */
export function parseMega645(html: string): ScrapeResult {
  // Draw ID: "Draw ID <b>#NNN</b>"
  const idMatch = html.match(/Draw ID\s*<b>\s*#(\d+)\s*<\/b>/i);
  if (!idMatch) return { success: false, error: "Không tìm thấy Draw ID" };
  const drawId = idMatch[1].padStart(5, "0");

  // Date: "Date <b>DD/MM/YYYY</b>"
  const dateMatch = html.match(/Date\s*<b>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/b>/i);
  if (!dateMatch)
    return { success: false, error: "Không tìm thấy Date" };
  const drawDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  // Numbers: <span class="bong_tron">04</span>...
  const ballMatches = Array.from(
    html.matchAll(/bong_tron[^>]*>\s*(\d{1,2})\s*</g),
    (m) => parseInt(m[1], 10)
  );
  // Mega 6/45: lấy 6 số đầu tiên, mỗi số 1-2 chữ số, max 45
  const numbers = ballMatches
    .slice(0, 6)
    .filter((n) => n >= 1 && n <= 45);

  // Jackpot: <h3>16.103.186.000</h3> sau chữ "Jackpot value"
  let jackpot = 0;
  const jackIdx = html.indexOf("Jackpot value");
  if (jackIdx !== -1) {
    const jackArea = html.substring(jackIdx, jackIdx + 1000);
    const jackMatch = jackArea.match(/<h3[^>]*>([\d.]+)<\/h3>/);
    if (jackMatch) {
      jackpot = parseInt(jackMatch[1].replace(/\./g, ""), 10);
    }
  }

  // Previous draw ID: ClientDrawResult('01579')
  const prevMatch = html.match(/ClientDrawResult\s*\(\s*['"](\d+)['"]\s*\)/);
  const previousDrawId = prevMatch ? prevMatch[1] : undefined;

  // Validate
  if (numbers.length < 6)
    return { success: false, error: `Chỉ tìm thấy ${numbers.length} số (< 6)` };
  for (const n of numbers) {
    if (n < 1 || n > 45)
      return { success: false, error: `Số ${n} ngoài phạm vi 1-45` };
  }

  return {
    success: true,
    previousDrawId,
    data: {
      id: 0,
      drawNumber: `MXSH-${drawId}`,
      lotteryType: "MEGA_645",
      drawDate,
      numbers,
      jackpot,
      published: true,
    },
  };
}

/**
 * Parse kết quả Power 6/55 — tương tự Mega 6/45
 * Power 6/55: 6 số chính (1-55) + 1 số đặc biệt bonus (1-55)
 * Cấu trúc HTML tương tự, có thêm class phân biệt
 */
/** Parse Power 6/55 từ HTML — export cho unit tests */
export function parsePower655(html: string): ScrapeResult {
  const idMatch = html.match(/Draw ID\s*<b>\s*#(\d+)\s*<\/b>/i);
  if (!idMatch) return { success: false, error: "Không tìm thấy Draw ID" };
  const drawId = idMatch[1].padStart(5, "0");

  const dateMatch = html.match(
    /Date\s*<b>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/b>/i
  );
  if (!dateMatch)
    return { success: false, error: "Không tìm thấy Date" };
  const drawDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  // Tất cả số: bong_tron (6 số chính) + bong_tron_special (bonus)
  // Power 6/55 có thể dùng class khác, lấy 7 số đầu (6 chính + 1 bonus)
  const allBalls = Array.from(
    html.matchAll(/bong_tron[^>]*>\s*(\d{1,2})\s*</g),
    (m) => parseInt(m[1], 10)
  );
  const mainNumbers = allBalls.slice(0, 6).filter((n) => n >= 1 && n <= 55);
  const bonusNumber = allBalls[6];

  // Jackpot
  let jackpot = 0;
  const jackIdx = html.indexOf("Jackpot value");
  if (jackIdx !== -1) {
    const jackArea = html.substring(jackIdx, jackIdx + 1000);
    const jackMatch = jackArea.match(/<h3[^>]*>([\d.]+)<\/h3>/);
    if (jackMatch) {
      jackpot = parseInt(jackMatch[1].replace(/\./g, ""), 10);
    }
  }

  const prevMatch = html.match(/ClientDrawResult\s*\(\s*['"](\d+)['"]\s*\)/);

  if (mainNumbers.length < 6)
    return {
      success: false,
      error: `Chỉ tìm thấy ${mainNumbers.length} số chính (< 6)`,
    };

  return {
    success: true,
    previousDrawId: prevMatch ? prevMatch[1] : undefined,
    data: {
      id: 0,
      drawNumber: `PXSH-${drawId}`,
      lotteryType: "POWER_655",
      drawDate,
      numbers: mainNumbers,
      bonusNumber,
      jackpot,
      published: true,
    },
  };
}

/**
 * Thử scraper trang HTML trước
 */
async function scrapeFromPage(
  url: string,
  lotteryType: LotteryType
): Promise<ScrapeResult> {
  const { ok, body, status } = await fetchWithRetry(url);
  if (!ok) return { success: false, error: `HTTP ${status}: Không truy cập được` };

  // Kiểm tra page hợp lệ
  if (
    body.length < 1000 ||
    body.includes("captcha") ||
    body.includes("401 Authorization")
  )
    return { success: false, error: `Trang bị chặn (${body.length} bytes)` };

  if (!body.includes("Draw ID"))
    return {
      success: false,
      error: "Trang không chứa kết quả — cấu trúc có thể đã thay đổi",
    };

  const parser = lotteryType === "MEGA_645" ? parseMega645 : parsePower655;
  return parser(body);
}

/**
 * Scrape kết quả mới nhất — thử nhiều nguồn theo thứ tự ưu tiên
 */
export async function scrapeLatest(
  lotteryType: LotteryType
): Promise<ScrapeResult> {
  const pages: Array<{ name: string; url: string }> =
    lotteryType === "MEGA_645"
      ? [
          {
            name: "vietlott_en",
            url: "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645",
          },
        ]
      : [
          {
            name: "vietlott_en",
            url: "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/655",
          },
        ];

  const errors: string[] = [];
  for (const page of pages) {
    const result = await scrapeFromPage(page.url, lotteryType);
    if (result.success) return result;
    errors.push(`${page.name}: ${result.error}`);
  }

  return {
    success: false,
    error: `Tất cả nguồn đều thất bại:\n  ${errors.join("\n  ")}`,
  };
}

/**
 * Scrape kết quả cụ thể theo Draw ID (dùng ClientDrawResult API)
 */
export async function scrapeByDrawId(
  lotteryType: LotteryType,
  drawId: string
): Promise<ScrapeResult> {
  // Vietlott sử dụng hàm JS ClientDrawResult(id) để navigate
  // Thử load trang với hash hoặc query param
  const pages = [
    `https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/${
      lotteryType === "MEGA_645" ? "645" : "655"
    }?id=${drawId}`,
    `https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/${
      lotteryType === "MEGA_645" ? "645" : "655"
    }#${drawId}`,
  ];

  for (const url of pages) {
    const result = await scrapeFromPage(url, lotteryType);
    if (result.success) return result;
  }

  return {
    success: false,
    error: `Không tìm thấy kỳ ${drawId}`,
  };
}
