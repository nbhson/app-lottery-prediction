/**
 * In-memory sliding-window rate limiter.
 *
 * Đủ dùng cho single instance. Khi deploy multi-instance, thay store
 * bằng Redis (giữ nguyên interface).
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

/** Lấy IP client từ proxy headers, fallback về "unknown". */
export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Tạo key rate-limit từ tên route + định danh client. */
export function rateLimitKey(route: string, identifier: string): string {
  return `${route}:${identifier}`;
}

/**
 * Helper tiện dụng cho API routes: kiểm tra + tiêu slot trong một lần gọi.
 * @returns null khi được phép, hoặc RateLimitResult bị chặn để trả 429.
 */
export function checkRateLimit(
  route: string,
  headers: Headers,
  limit: number,
  windowMs: number
): RateLimitResult | null {
  const result = rateLimit(rateLimitKey(route, getClientIp(headers)), limit, windowMs);
  return result.ok ? null : result;
}
