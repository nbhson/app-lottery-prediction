/**
 * Unit tests cho src/lib/rate-limit.ts — sliding-window semantics.
 * Chạy: npx tsx --test tests/rate-limit.test.ts
 */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, rateLimitKey, getClientIp, checkRateLimit } from "../src/lib/rate-limit";

let seq = 0;
const uniqueKey = () => `test-${++seq}`;

describe("rateLimit — sliding window", () => {
  it("cho phép request trong giới hạn và đếm remaining đúng", () => {
    const key = uniqueKey();
    const r1 = rateLimit(key, 3, 60_000);
    const r2 = rateLimit(key, 3, 60_000);
    assert.equal(r1.ok, true);
    assert.equal(r1.remaining, 2);
    assert.equal(r2.ok, true);
    assert.equal(r2.remaining, 1);
  });

  it("chặn khi vượt limit, trả retryAfter > 0", () => {
    const key = uniqueKey();
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    const blocked = rateLimit(key, 2, 60_000);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60, `retryAfter=${blocked.retryAfter}`);
  });

  it("cho phép lại sau khi window hết hạn", (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    const key = uniqueKey();
    rateLimit(key, 1, 1_000);
    assert.equal(rateLimit(key, 1, 1_000).ok, false);
    t.mock.timers.tick(1_100);
    assert.equal(rateLimit(key, 1, 1_000).ok, true);
  });

  it("hoạt động sliding (không phải fixed window)", (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    const key = uniqueKey();
    rateLimit(key, 2, 10_000); // hit @ t=0
    t.mock.timers.tick(9_500);
    rateLimit(key, 2, 10_000); // hit @ t=9.5s
    t.mock.timers.tick(700); // t=10.2s — hit đầu đã rơi khỏi window
    const r = rateLimit(key, 2, 10_000);
    assert.equal(r.ok, true);
    assert.equal(r.remaining, 0);
  });

  it("retryAfter tính từ hit cũ nhất trong window", (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    const key = uniqueKey();
    rateLimit(key, 1, 5_000); // hit @ t=0
    t.mock.timers.tick(2_000);
    assert.equal(rateLimit(key, 1, 5_000).retryAfter, 3);
  });

  it("các key độc lập với nhau", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    rateLimit(a, 1, 60_000);
    assert.equal(rateLimit(a, 1, 60_000).ok, false);
    assert.equal(rateLimit(b, 1, 60_000).ok, true);
  });
});

describe("getClientIp", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("lấy entry đầu của x-forwarded-for", () => {
    assert.equal(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
      "203.0.113.5"
    );
  });

  it("trim whitespace quanh IP", () => {
    assert.equal(
      getClientIp(headers({ "x-forwarded-for": "  198.51.100.7 , 10.0.0.1" })),
      "198.51.100.7"
    );
  });

  it("fallback x-real-ip", () => {
    assert.equal(getClientIp(headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  });

  it("không có header nào → unknown", () => {
    assert.equal(getClientIp(headers({})), "unknown");
  });
});

describe("rateLimitKey + checkRateLimit", () => {
  it("ghép route:identifier", () => {
    assert.equal(rateLimitKey("sync", "1.2.3.4"), "sync:1.2.3.4");
  });

  it("checkRateLimit trả null khi được phép, object khi bị chặn", () => {
    const h = new Headers({ "x-forwarded-for": `10.1.1.${++seq}` });
    assert.equal(checkRateLimit("route-x", h, 1, 60_000), null);
    const blocked = checkRateLimit("route-x", h, 1, 60_000);
    assert.notEqual(blocked, null);
    assert.equal(blocked?.ok, false);
    assert.ok((blocked?.retryAfter ?? 0) > 0);
  });
});
