/**
 * Scraper cho trang English của vietlott.vn
 * ============================================================
 * ĐÃ XÁC MINH (29/10/2026): https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645
 *
 * Cấu trúc HTML chính xác đã quan sát:
 *   <H5>Draw ID <b>#01580</b> Date <b>25/10/2026</b></H5>
 *   <span class="bong_tron">04</span><span class="bong_tron">13</span>...
 *   <h3>16.103.186.000</h3>
 *
 * Nguồn backfill (đã xác minh 30/10/2026):
 *   - https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/winning-number-645
 *   - https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/winning-number-655
 *   Hai trang này chứa bảng TOÀN BỘ lịch sử (date, draw id, 6 số, bonus)
 *   → 1 request duy nhất để backfill cả nghìn kỳ, không cần crawl từng kỳ.
 *   (Trang chi tiết chỉ nhận kỳ qua ajaxpro cần session/token — không dùng được.)
 */

import { getConfig } from "@/lib/config";
import { DrawResult, LotteryType } from "@/types/lottery";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Trang kết quả mới nhất + trang lịch sử đầy đủ cho từng loại hình */
const PAGE_URLS: Record<LotteryType, { latest: string; history: string }> = {
  MEGA_645: {
    latest: "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/645",
    history:
      "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/winning-number-645",
  },
  POWER_655: {
    latest: "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/655",
    history:
      "https://vietlott.vn/en/trung-thuong/ket-qua-trung-thuong/winning-number-655",
  },
} as const;

interface ScrapeResult {
  success: boolean;
  data?: DrawResult;
  error?: string;
  previousDrawId?: string; // dùng để scrape tiếp kỳ trước
}

interface ScrapeHistoryResult {
  success: boolean;
  draws?: DrawResult[]; // mới nhất trước
  error?: string;
}

/** Fetch + retry với delay tăng dần — cấu hình qua config.dataSource */
async function fetchWithRetry(
  url: string,
  retries?: number,
  delayMs?: number
): Promise<{ ok: boolean; body: string; status: number }> {
  const cfg = getConfig().dataSource;
  const maxAttempts = retries ?? cfg.maxRetries;
  const delay = delayMs ?? cfg.retryDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.text();
      return { ok: res.ok, body, status: res.status };
    } catch {
      if (attempt === maxAttempts) return { ok: false, body: "", status: 0 };
      await new Promise((r) => setTimeout(r, delay * attempt));
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
 * Cấu trúc HTML đã xác minh: 6 span bong_tron (chính), rồi dấu phân cách
 * (<i>|</i> hoặc <span class="bong_tron-sperator">|</span>), rồi span bonus.
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

  // Tách phần trước/sau dấu phân tách bonus (span.bong_tron-sperator hoặc <i>|</i>)
  const sepIdx = html.search(/bong_tron-sperator|<i>\|<\/i>/);
  const mainHtml = sepIdx === -1 ? html : html.substring(0, sepIdx);
  const bonusHtml = sepIdx === -1 ? "" : html.substring(sepIdx);

  // Số chính: 6 số bong_tron TRƯỚC dấu phân cách (loại trừ bonus)
  const mainBalls = Array.from(
    mainHtml.matchAll(/bong_tron[^>]*>\s*(\d{1,2})\s*</g),
    (m) => parseInt(m[1], 10)
  ).filter((n) => n >= 1 && n <= 55);

  // Bonus: span bong_tron ĐẦU TIÊN sau dấu phân cách — validate phạm vi 1–55
  const bonusMatch = bonusHtml.match(/bong_tron[^>]*>\s*(\d{1,2})\s*</);
  const bonusParsed = bonusMatch ? parseInt(bonusMatch[1], 10) : NaN;
  const bonusNumber =
    Number.isInteger(bonusParsed) && bonusParsed >= 1 && bonusParsed <= 55
      ? bonusParsed
      : undefined;

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

  if (mainBalls.length < 6)
    return {
      success: false,
      error: `Chỉ tìm thấy ${mainBalls.length} số chính (< 6)`,
    };

  return {
    success: true,
    previousDrawId: prevMatch ? prevMatch[1] : undefined,
    data: {
      id: 0,
      drawNumber: `PXSH-${drawId}`,
      lotteryType: "POWER_655",
      drawDate,
      numbers: mainBalls.slice(0, 6),
      bonusNumber,
      jackpot,
      published: true,
    },
  };
}

/**
 * Scrape kết quả mới nhất từ trang chi tiết (1 kỳ)
 */
export async function scrapeLatest(
  lotteryType: LotteryType
): Promise<ScrapeResult> {
  const { ok, body, status } = await fetchWithRetry(PAGE_URLS[lotteryType].latest);
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
 * Parse trang lịch sử đầy đủ (winning-number-645/655) — bảng chứa TẤT CẢ các kỳ.
 * Cấu trúc đã xác minh mỗi <tr>:
 *   <td>28/10/2026</td>
 *   <td><a href=".../645?id=01581&nocatche=1">01581</a></td>
 *   <td><span class="bong_tron">01</span>...x6 [(<i>|</i> hoặc bong_tron-sperator) + span bonus]</td>
 *
 * Trả về danh sách sắp xếp MỚI NHẤT TRƯỚC. Jackpot không có trên bảng
 * lịch sử → để 0 (được cập nhật ở lần sync chi tiết kế tiếp với kỳ mới nhất).
 */
export function parseHistoryPage(
  html: string,
  lotteryType: LotteryType
): ScrapeHistoryResult {
  const rule = lotteryType === "MEGA_645" ? { max: 45, prefix: "MXSH" } : { max: 55, prefix: "PXSH" };

  const rows = Array.from(html.matchAll(/<tr>([\s\S]*?)<\/tr>/g), (m) => m[1]);
  const draws: DrawResult[] = [];

  for (const row of rows) {
    const dateMatch = row.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const idMatch = row.match(/\?id=(\d+)/);
    if (!dateMatch || !idMatch) continue;

    // Tách main/bonus tại dấu phân cách (nếu có) — chỉ áp dụng cho Power 6/55
    const sepIdx = row.search(/bong_tron-sperator|<i>\|<\/i>/);
    const mainHtml = sepIdx === -1 ? row : row.substring(0, sepIdx);
    const bonusHtml = sepIdx === -1 ? "" : row.substring(sepIdx);

    const mainBalls = Array.from(
      mainHtml.matchAll(/bong_tron[^>]*>\s*(\d{1,2})\s*</g),
      (m) => parseInt(m[1], 10)
    ).filter((n) => n >= 1 && n <= rule.max);

    if (mainBalls.length < 6) continue; // hàng dị thường → bỏ, không fail cả trang

    let bonusNumber: number | undefined;
    if (lotteryType === "POWER_655") {
      const bonusMatch = bonusHtml.match(/bong_tron[^>]*>\s*(\d{1,2})\s*</);
      const bonusParsed = bonusMatch ? parseInt(bonusMatch[1], 10) : NaN;
      if (
        Number.isInteger(bonusParsed) &&
        bonusParsed >= 1 &&
        bonusParsed <= rule.max
      ) {
        bonusNumber = bonusParsed;
      }
    }

    draws.push({
      id: 0,
      drawNumber: `${rule.prefix}-${idMatch[1].padStart(5, "0")}`,
      lotteryType,
      drawDate: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      numbers: mainBalls.slice(0, 6),
      bonusNumber,
      jackpot: 0,
      published: true,
    });
  }

  if (draws.length === 0)
    return {
      success: false,
      error: "Không parse được kỳ nào từ trang lịch sử — cấu trúc có thể đã thay đổi",
    };

  // Trang hiển thị mới nhất trước — đảm bảo bất biến thứ tự
  draws.sort((a, b) => (a.drawDate < b.drawDate ? 1 : a.drawDate > b.drawDate ? -1 : 0));

  return { success: true, draws };
}

/**
 * Scrape TOÀN BỘ lịch sử từ trang winning-number (1 request duy nhất).
 * Dùng cho backfill lần đầu — DB trống hoặc thiếu dữ liệu.
 */
export async function scrapeHistory(
  lotteryType: LotteryType
): Promise<ScrapeHistoryResult> {
  const { ok, body, status } = await fetchWithRetry(
    PAGE_URLS[lotteryType].history
  );
  if (!ok)
    return { success: false, error: `HTTP ${status}: Không truy cập được trang lịch sử` };

  if (body.length < 1000 || body.includes("captcha"))
    return { success: false, error: `Trang lịch sử bị chặn (${body.length} bytes)` };

  return parseHistoryPage(body, lotteryType);
}

// ============================================================
// Backfill theo chuỗi kỳ (ajaxpro — đã xác minh hoạt động 30/10/2026)
// ============================================================

/**
 * WebPart ajaxpro trang chi tiết cho từng loại hình.
 * Key lấy từ JS của trang (ClientDrawResult → ServerSideDrawResult(ORenderInfo,'KEY',DrawId)).
 */
const DETAIL_WEBPARTS: Record<LotteryType, { type: string; key: string }> = {
  MEGA_645: { type: "Game645ResultDetailWebPart", key: "69c140a0" },
  POWER_655: { type: "Game655ResultDetailWebPart", key: "e0a60505" },
};

/** URL endpoint ajaxpro chi tiết (export cho log cảnh báo backfill) */
export function getDetailEndpointUrl(lotteryType: LotteryType): string {
  const wp = DETAIL_WEBPARTS[lotteryType];
  return `https://vietlott.vn/ajaxpro/Vietlott.PlugIn.WebParts.${wp.type},Vietlott.PlugIn.WebParts.ashx`;
}

/** ORenderInfo đầy đủ (lấy từ endpoint WebEnvironments.ServerSideFrontEndCreateRenderInfo — đã xác minh) */
const ORENDER_INFO = {
  SiteId: "main.frontend.vi",
  SiteAlias: "main.vi",
  UserSessionId: "",
  SiteLang: "en",
  IsPageDesign: false,
  ExtraParam1: "",
  ExtraParam2: "",
  ExtraParam3: "",
  SiteURL: "",
  WebPage: null,
  SiteName: "Vietlott",
  OrgPageAlias: null,
  PageAlias: null,
  FullPageAlias: null,
  RefKey: null,
  System: 1,
} as const;

interface AjaxProValue {
  value?: {
    Error?: boolean;
    InfoMessage?: string | null;
    /** HTML chi tiết kỳ (chứa Draw ID, Date, balls, nút kỳ trước) */
    RetExtraParam1?: string | null;
  };
}

/**
 * Scrape chi tiết 1 kỳ theo Draw ID qua ajaxpro ServerSideDrawResult.
 * Không cần cookie/session — đã xác minh. Trả về kỳ + previousDrawId
 * để dùng làm chuỗi backfill (kỳ trước của kỳ trước...).
 */
export async function scrapeDrawDetail(
  lotteryType: LotteryType,
  drawId: string
): Promise<ScrapeResult> {
  const wp = DETAIL_WEBPARTS[lotteryType];
  const url = `https://vietlott.vn/ajaxpro/Vietlott.PlugIn.WebParts.${wp.type},Vietlott.PlugIn.WebParts.ashx`;
  const body = JSON.stringify({
    ORenderInfo: ORENDER_INFO,
    Key: wp.key,
    DrawId: drawId,
  });

  const cfg = getConfig().dataSource;
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "text/plain; charset=UTF-8",
          "X-AjaxPro-Method": "ServerSideDrawResult",
          Referer: PAGE_URLS[lotteryType].latest,
          Origin: "https://vietlott.vn",
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if (attempt < cfg.maxRetries) {
          await new Promise((r) => setTimeout(r, cfg.retryDelayMs * attempt));
          continue;
        }
        return { success: false, error: `HTTP ${res.status} khi gọi ajaxpro` };
      }

      const payload = (await res.json()) as AjaxProValue;
      if (payload.value?.Error) {
        return {
          success: false,
          error: `ajaxpro lỗi: ${payload.value.InfoMessage ?? "unknown"}`,
        };
      }

      const html = payload.value?.RetExtraParam1 ?? "";
      if (!html.includes("Draw ID")) {
        return {
          success: false,
          error: `Kỳ ${drawId}: response không chứa kết quả (kỳ có thể không tồn tại)`,
        };
      }

      const parser = lotteryType === "MEGA_645" ? parseMega645 : parsePower655;
      return parser(html);
    } catch {
      if (attempt < cfg.maxRetries) {
        await new Promise((r) => setTimeout(r, cfg.retryDelayMs * attempt));
        continue;
      }
      return { success: false, error: `Mạng lỗi khi scrape kỳ ${drawId}` };
    }
  }
  return { success: false, error: `Không scrape được kỳ ${drawId}` };
}
