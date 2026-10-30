/**
 * Cache TTL in-memory cho các phép tính thống kê nặng (frequency, pair matrix,
 * trend...) — tránh tính lại toàn bộ ở mọi request.
 *
 * - TTL mặc định 60s: dữ liệu xổ số chỉ thay đổi khi sync (vài lần/giờ)
 * - Tự vô hiệu hóa ngay khi có kỳ mới được chèn vào DB (xem db.ts)
 * - Lưu trên globalThis để sống sót qua HMR trong dev (giống pattern db.ts)
 */

const CACHE_PREFIX = "draws-stats:";
const DEFAULT_TTL_MS = 60_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

interface CacheStore {
  map: Map<string, CacheEntry>;
}

// Giữ singleton qua globalThis — HMR reload module không mất cache
const globalStore = globalThis as typeof globalThis & {
  __lotteryStatsCache?: CacheStore;
};

function getStore(): CacheStore {
  if (!globalStore.__lotteryStatsCache) {
    globalStore.__lotteryStatsCache = { map: new Map() };
  }
  return globalStore.__lotteryStatsCache;
}

/** Lấy giá trị từ cache — trả undefined nếu hết hạn hoặc chưa có */
export function cacheGet<T>(key: string): T | undefined {
  const entry = getStore().map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    getStore().map.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Ghi giá trị vào cache với TTL (ms) */
export function cacheSet(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  getStore().map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Xóa toàn bộ cache thống kê — gọi khi DB có kỳ mới (upsertDraw/insertDrawsMany) */
export function invalidateDrawsCache(): void {
  const store = getStore();
  for (const key of store.map.keys()) {
    if (key.startsWith(CACHE_PREFIX)) {
      store.map.delete(key);
    }
  }
}

/** Tạo key cache chuẩn cho thống kê theo loại hình */
export function drawsCacheKey(...parts: Array<string | number>): string {
  return `${CACHE_PREFIX}${parts.join(":")}`;
}
