/**
 * In-memory sliding-window rate limiter.
 *
 * Đủ dùng cho single instance. Khi deploy multi-instance, thay store
 * bằng Redis (giữ nguyên interface).
 *
 * Mô hình 2 lớp chống bypass:
 * 1. Per-IP bucket — chỉ tin `x-forwarded-for`/`x-real-ip` khi TRUST_PROXY
 *    được bật (chạy sau reverse proxy đáng tin như nginx/Cloudflare).
 *    Nếu không, header này do CLIENT tự gửi → dễ spoof để né limit.
 * 2. Global cap mỗi route — không phụ thuộc IP, kẻ xoay IP cũng không
 *    vượt được trần tổng (quan trọng với route tốn tiền như /api/ai-prediction).
 */

type Bucket = {
  /** Timestamps (ms) của các request nằm trong window hiện tại. */
  hits: number[];
};

const buckets = new Map<string, Bucket>();

/** Dọn bucket stale định kỳ để map không phình vô hạn. */
const CLEANUP_INTERVAL_MS = 60_000;
let lastEviction = Date.now();

function evictStale(now: number) {
  if (now - lastEviction < CLEANUP_INTERVAL_MS) return;
  lastEviction = now;
  buckets.forEach((bucket, key) => {
    if (
      bucket.hits.length === 0 ||
      now - bucket.hits[bucket.hits.length - 1] > 10 * CLEANUP_INTERVAL_MS
    ) {
      buckets.delete(key);
    }
  });
}

export type RateLimitResult = {
  /** Request được cho phép hay không. */
  ok: boolean;
  /** Số request còn lại trong window. */
  remaining: number;
  /** Số giây phải chờ trước khi thử lại (0 khi được phép). */
  retryAfter: number;
};

/** Chỉ tin header proxy khi TRUST_PROXY=1 (set ở reverse proxy / load balancer) */
function isTrustedProxy(): boolean {
  const v = process.env.TRUST_PROXY?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Tiêu một slot trong bucket của `key`.
 * @param key      Định danh client (route:ip)
 * @param limit    Số request tối đa mỗi window
 * @param windowMs Độ dài window (ms)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  evictStale(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    retryAfter: 0,
  };
}

/**
 * Lấy IP client. Chỉ tin `x-forwarded-for`/`x-real-ip` khi TRUST_PROXY được bật —
 * nếu không, header này do client tự gửi và có thể spoof để né rate limit.
 */
export function getClientIp(headers: Headers): string {
  if (isTrustedProxy()) {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return headers.get("x-real-ip") ?? "unknown";
  }
  // Không chạy sau proxy đáng tin → không thể biết IP thật, gộp về 1 bucket
  // (global cap ở checkRateLimit vẫn giới hạn tổng lưu lượng).
  return "unknown";
}

/** Tạo key rate-limit từ tên route + định danh client. */
export function rateLimitKey(route: string, identifier: string): string {
  return `${route}:${identifier}`;
}

export interface RateLimitOptions {
  /** Trần TỔNG số request mỗi window cho toàn route — không bypass được bằng IP giả. */
  globalLimit?: number;
  /** Window cho global cap (ms), mặc định bằng windowMs */
  globalWindowMs?: number;
}

/**
 * Helper tiện dụng cho API routes: kiểm tra + tiêu slot trong một lần gọi.
 * Thứ tự: global bucket trước (rẻ, chặn flood tổng), rồi per-IP.
 *
 * @returns null khi được phép, hoặc RateLimitResult bị chặn để trả 429.
 */
export function checkRateLimit(
  route: string,
  headers: Headers,
  limit: number,
  windowMs: number,
  opts?: { globalLimit?: number; globalWindowMs?: number }
): RateLimitResult | null {
  if (opts?.globalLimit) {
    const global = rateLimit(
      rateLimitKey("global", route),
      opts.globalLimit,
      opts.globalWindowMs ?? windowMs
    );
    if (!global.ok) return global;
  }

  const result = rateLimit(
    rateLimitKey(route, getClientIp(headers)),
    limit,
    windowMs
  );
  return result.ok ? null : result;
}
