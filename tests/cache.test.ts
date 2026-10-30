/**
 * Test cho src/lib/cache.ts — cache TTL + invalidate khi có kỳ mới
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cacheGet,
  cacheSet,
  invalidateDrawsCache,
  drawsCacheKey,
} from "../src/lib/cache";

describe("cache", () => {
  test("cacheSet/cacheGet — lưu và đọc lại giá trị", () => {
    const key = drawsCacheKey("test-setget", "MEGA_645");
    invalidateDrawsCache(); // dọn trạng thái từ test khác

    assert.equal(cacheGet(key), undefined);
    cacheSet(key, { foo: 1 });
    assert.deepEqual(cacheGet(key), { foo: 1 });
  });

  test("TTL hết hạn — giá trị hết hạn trả undefined", () => {
    const key = drawsCacheKey("test-ttl", "MEGA_645");
    invalidateDrawsCache();

    cacheSet(key, "stale", 1); // TTL 1ms
    // Chờ quá TTL
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* busy wait */
    }
    assert.equal(cacheGet(key), undefined);
  });

  test("invalidateDrawsCache — chỉ xóa key tiền tố draws-stats:", () => {
    invalidateDrawsCache();

    const drawsKey = drawsCacheKey("test-inv", "MEGA_645");
    cacheSet(drawsKey, "draws-value");
    cacheSet("unrelated-key", "other-value");

    invalidateDrawsCache();

    assert.equal(cacheGet(drawsKey), undefined);
    assert.equal(cacheGet("unrelated-key"), "other-value");

    // dọn dẹp
    cacheSet("unrelated-key", null);
  });

  test("drawsCacheKey — ghép phần thành key chuẩn", () => {
    assert.equal(
      drawsCacheKey("stats", "MEGA_645", 20),
      "draws-stats:stats:MEGA_645:20"
    );
  });

  test("cache bền vững qua nhiều lần get (không tự xóa giữa 2 lần đọc)", () => {
    const key = drawsCacheKey("test-stable", "POWER_655");
    invalidateDrawsCache();

    cacheSet(key, 42, 10_000);
    assert.equal(cacheGet(key), 42);
    assert.equal(cacheGet(key), 42);
  });
});
