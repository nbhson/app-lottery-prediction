/**
 * Test cho src/lib/notify.ts — webhook cảnh báo sync fail/stale
 * (fetch mock, không gọi network thật).
 * Chạy: npx tsx --test tests/notify.test.ts
 */
import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFY_COOLDOWN_MS,
  SYNC_FAIL_NOTIFY_THRESHOLD,
  notifySyncStale,
  recordSyncFailure,
  recordSyncSuccess,
  resetNotifyState,
  sendNotification,
} from "../src/lib/notify";

interface FakeCall {
  url: string;
  init?: RequestInit;
}

const realFetch = globalThis.fetch;
let fetchCalls: FakeCall[] = [];
let fetchStatus = 200;

/** Thay globalThis.fetch bằng fake ghi lại mọi call */
function mockFetch() {
  fetchCalls = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(null, { status: fetchStatus });
  }) as typeof fetch;
}

before(() => mockFetch());
// Reset fetch mock trước MỖI test — fetchCalls không tích lũy giữa các test
beforeEach(() => mockFetch());
after(() => {
  globalThis.fetch = realFetch;
});

function lastBody(): Record<string, unknown> {
  const last = fetchCalls[fetchCalls.length - 1];
  assert.ok(last?.init?.body, "fetch phải được gọi với body JSON");
  return JSON.parse(String(last.init.body));
}

describe("sendNotification — no-op", () => {
  test("không set NOTIFY_WEBHOOK_URL → no-op, không gọi fetch", async () => {
    delete process.env.NOTIFY_WEBHOOK_URL;
    resetNotifyState();

    const sent = await sendNotification("reason-x", "message");
    assert.equal(sent, false);
    assert.equal(fetchCalls.length, 0);
  });
});

describe("sendNotification — generic webhook", () => {
  test("POST JSON đúng shape { reason, message, app, timestamp }", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    const sent = await sendNotification("sync-stale", "dữ liệu quá cũ");
    assert.equal(sent, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://hooks.example.com/alert");
    assert.equal(fetchCalls[0].init?.method, "POST");
    assert.equal(
      (fetchCalls[0].init?.headers as Record<string, string>)["content-type"],
      "application/json"
    );
    const body = lastBody();
    assert.equal(body.reason, "sync-stale");
    assert.equal(body.message, "dữ liệu quá cũ");
    assert.equal(body.app, "app-lottery-prediction");
    assert.equal(typeof body.timestamp, "string");
  });

  test("cooldown — reason trùng trong 1 giờ → không gửi lần 2", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    assert.equal(await sendNotification("same-reason", "lần 1"), true);
    assert.equal(await sendNotification("same-reason", "lần 2"), false);
    assert.equal(fetchCalls.length, 1); // chỉ 1 request

    // reason khác → không bị cooldown của reason trên chặn
    assert.equal(await sendNotification("other-reason", "lần 1"), true);
    assert.equal(fetchCalls.length, 2);
    assert.ok(NOTIFY_COOLDOWN_MS >= 60 * 60_000, "cooldown tối thiểu 1 giờ");
  });

  test("webhook trả lỗi (500) → trả false, không throw", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();
    fetchStatus = 500;

    const sent = await sendNotification("fail-reason", "msg");
    assert.equal(sent, false);

    fetchStatus = 200;
  });

  test("fetch throw (network lỗi) → trả false, không throw", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const sent = await sendNotification("net-reason", "msg");
    assert.equal(sent, false);
    mockFetch();
  });
});

describe("sendNotification — Telegram-compatible", () => {
  test("URL chứa api.telegram.org → gửi format sendMessage { chat_id, text }", async () => {
    delete process.env.NOTIFY_TELEGRAM_CHAT_ID;
    process.env.NOTIFY_WEBHOOK_URL =
      "https://api.telegram.org/bot123:ABC/sendMessage?chat_id=42";
    resetNotifyState();

    const sent = await sendNotification("sync-stale", "stale warning");
    assert.equal(sent, true);
    assert.equal(fetchCalls.length, 1);
    const body = lastBody();
    assert.deepEqual(body, { chat_id: "42", text: "stale warning" });
  });

  test("chat_id lấy từ NOTIFY_TELEGRAM_CHAT_ID khi không có trong URL", async () => {
    process.env.NOTIFY_WEBHOOK_URL =
      "https://api.telegram.org/bot123:ABC/sendMessage";
    process.env.NOTIFY_TELEGRAM_CHAT_ID = "999";
    resetNotifyState();

    await sendNotification("sync-stale", "stale warning");
    const body = lastBody();
    assert.equal(body.chat_id, "999");
    delete process.env.NOTIFY_TELEGRAM_CHAT_ID;
  });

  test("Telegram thiếu chat_id → không gửi", async () => {
    delete process.env.NOTIFY_TELEGRAM_CHAT_ID;
    process.env.NOTIFY_WEBHOOK_URL =
      "https://api.telegram.org/bot123:ABC/sendMessage";
    resetNotifyState();

    const sent = await sendNotification("sync-stale", "stale warning");
    assert.equal(sent, false);
    assert.equal(fetchCalls.length, 0);
  });
});

describe("recordSyncFailure / recordSyncSuccess", () => {
  test("fail < ngưỡng (3) → chưa gửi cảnh báo", () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    recordSyncFailure("sync:MEGA_645", "err 1");
    recordSyncFailure("sync:MEGA_645", "err 2");
    assert.equal(fetchCalls.length, 0);
    assert.equal(SYNC_FAIL_NOTIFY_THRESHOLD, 3);
  });

  test("fail >= 3 lần liên tiếp → gửi cảnh báo (fire-and-forget)", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    recordSyncFailure("sync:MEGA_645", "err 1");
    recordSyncFailure("sync:MEGA_645", "err 2");
    recordSyncFailure("sync:MEGA_645", "err 3");
    // recordSyncFailure fire-and-forget (void promise) — chờ microtask
    await new Promise((r) => setImmediate(r));

    assert.equal(fetchCalls.length, 1);
    const body = lastBody();
    assert.equal(body.reason, "sync-fail:sync:MEGA_645");
    assert.ok(
      String(body.message).includes("3 lần liên tiếp"),
      `message phải nêu số lần fail: ${body.message}`
    );
    assert.ok(String(body.message).includes("err 3"));
  });

  test("recordSyncSuccess reset bộ đếm — fail 2 lần + success → phải fail đủ 3 lần mới gửi", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    recordSyncFailure("backfill:POWER_655", "err 1");
    recordSyncFailure("backfill:POWER_655", "err 2");
    recordSyncSuccess("backfill:POWER_655");
    recordSyncFailure("backfill:POWER_655", "err 3");
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchCalls.length, 0); // chỉ 1 fail sau reset — chưa đủ ngưỡng

    recordSyncFailure("backfill:POWER_655", "err 4");
    recordSyncFailure("backfill:POWER_655", "err 5");
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchCalls.length, 1); // đủ 3 fail liên tiếp
    const body = lastBody();
    assert.equal(body.reason, "sync-fail:backfill:POWER_655");
  });

  test("key khác nhau đếm độc lập", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    recordSyncFailure("sync:MEGA_645", "a1");
    recordSyncFailure("backfill:MEGA_645", "b1");
    recordSyncFailure("sync:MEGA_645", "a2");
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchCalls.length, 0);
  });

  test("lỗi liên tiếp vẫn tôn trọng cooldown — không spam webhook", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    for (let i = 1; i <= 5; i++) {
      recordSyncFailure("sync:MEGA_645", `err ${i}`);
    }
    await new Promise((r) => setImmediate(r));
    assert.equal(fetchCalls.length, 1); // 1 cảnh báo duy nhất trong cooldown
  });
});

describe("notifySyncStale", () => {
  test("gửi cảnh báo stale với message nêu tuổi dữ liệu + ngưỡng", async () => {
    process.env.NOTIFY_WEBHOOK_URL = "https://hooks.example.com/alert";
    resetNotifyState();

    const sent = await notifySyncStale(
      "2026-11-01 08:00:00",
      95,
      60
    );
    assert.equal(sent, true);
    const body = lastBody();
    assert.equal(body.reason, "sync-stale");
    const message = String(body.message);
    assert.ok(message.includes("95 phút"), `message: ${message}`);
    assert.ok(message.includes("60 phút"), `message: ${message}`);
    assert.ok(message.includes("2026-11-01 08:00:00"), `message: ${message}`);
  });
});
