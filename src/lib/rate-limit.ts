/**
 * Rate limiter 2 chế độ — tự chọn theo cấu hình:
 *
 * 1. **In-memory sliding-window** (mặc định) — đủ dùng cho single instance.
 * 2. **Redis fixed-window** khi set `REDIS_URL` — chia sẻ bucket qua nhiều
 *    instance (multi-instance safe). Dùng Lua script atomic (INCR + PEXPIRE
 *    + PTTL trong 1 round-trip). Redis chết/timeout → tự fallback in-memory,
 *    không làm sập request.
 *
 * Mô hình 2 lớp chống bypass (cả hai chế độ):
 * 1. Per-IP bucket — chỉ tin `x-forwarded-for`/`x-real-ip` khi TRUST_PROXY
 *    được bật (chạy sau reverse proxy đáng tin như nginx/Cloudflare).
 *    Nếu không, header này do CLIENT tự gửi → dễ spoof để né limit.
 * 2. Global cap mỗi route — không phụ thuộc IP, kẻ xoay IP cũng không
 *    vượt được trần tổng (quan trọng với route tốn tiền như /api/ai-prediction).
 */
import type Redis from "ioredis";

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

// ============================================================
// Redis store (multi-instance) — chỉ kích hoạt khi REDIS_URL được set
// ============================================================

/** Lua atomic: INCR + PEXPIRE lần đầu + PTTL — 1 round-trip, không race */
const RL_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}
`;

// Singleton client — tạo lazily, tái dùng mọi request
let redisPromise: Promise<Redis | null> | null = null;

function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return Promise.resolve(null);
  if (!redisPromise) {
    redisPromise = import("ioredis")
      .then((mod) => new mod.default(url, { lazyConnect: false, maxRetriesPerRequest: 1 }))
      .catch((err: unknown) => {
        console.error(
          "[rate-limit] Không tạo được Redis client — dùng in-memory:",
          err instanceof Error ? err.message : err
        );
        return null;
      });
  }
  return redisPromise;
}

/** Fixed-window qua Redis. Trả null nếu Redis không khả dụng (caller fallback). */
async function rateLimitRedis(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const redis = await getRedis();
  if (!redis) return null;

  try {
    const result = (await redis.eval(
      RL_LUA,
      1,
      `rl:${key}`,
      String(windowMs)
    )) as [number, number];
    const [count, ttlMs] = result;

    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)),
      };
    }
    return { ok: true, remaining: limit - count, retryAfter: 0 };
  } catch (err: unknown) {
    // Redis lỗi giữa chừng → không chặn request, fallback in-memory
    console.error(
      "[rate-limit] Redis lỗi — fallback in-memory:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Helper tiện dụng cho API routes: kiểm tra + tiêu slot trong một lần gọi.
 * Thứ tự: global bucket trước (rẻ, chặn flood tổng), rồi per-IP.
 *
 * REDIS_URL set → bucket lưu trên Redis (multi-instance safe);
 * không set hoặc Redis lỗi → in-memory sliding-window.
 *
 * @returns null khi được phép, hoặc RateLimitResult bị chặn để trả 429.
 */
export async function checkRateLimit(
  route: string,
  headers: Headers,
  limit: number,
  windowMs: number,
  opts?: { globalLimit?: number; globalWindowMs?: number }
): Promise<RateLimitResult | null> {
  const globalLimit = opts?.globalLimit;
  const globalWindowMs = opts?.globalWindowMs ?? windowMs;

  if (await getRedis()) {
    if (globalLimit) {
      const blocked =
        (await rateLimitRedis(`global:${route}`, globalLimit, globalWindowMs)) ??
        (() => {
          const r = rateLimit(rateLimitKey("global", route), globalLimit, globalWindowMs);
          return r.ok ? null : r;
        })();
      if (blocked) return blocked;
    }

    const perIpKey = rateLimitKey(route, getClientIp(headers));
    const result =
      (await rateLimitRedis(perIpKey, limit, windowMs)) ??
      (() => {
        const r = rateLimit(perIpKey, limit, windowMs);
        return r.ok ? null : r;
      })();
    return result;
  }

  // In-memory sliding-window (mặc định)
  if (globalLimit) {
    const global = rateLimit(
      rateLimitKey("global", route),
      globalLimit,
      globalWindowMs
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
