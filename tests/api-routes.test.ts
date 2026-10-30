/**
 * Integration tests cho API routes — gọi route handlers trực tiếp
 * (không cần khởi động server Next.js).
 * Chạy: npx tsx --test tests/api-routes.test.ts
 *
 * Lưu ý: đọc SQLite thật tại data/vietlott.db (repo đã có dữ liệu).
 * Route /api/sync và /api/ai-prediction có rate limit 5-10 req/phút —
 * test chỉ gọi vài lần nên không chạm ngưỡng.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as statusGET } from "../src/app/api/status/route";
import { GET as latestGET } from "../src/app/api/draws/latest/route";
import { GET as historyGET } from "../src/app/api/draws/history/route";
import { GET as predGET } from "../src/app/api/prediction/route";
import { GET as aiPredGET } from "../src/app/api/ai-prediction/route";
import { GET as accuracyGET } from "../src/app/api/accuracy/route";
import { GET as healthGET } from "../src/app/api/health/route";
import { POST as syncPOST } from "../src/app/api/sync/route";

const req = (path: string) =>
  new NextRequest(new Request(`http://localhost${path}`));

describe("GET /api/status", () => {
  it("200 + không bao giờ lộ API key", async () => {
    const res = await statusGET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data, "phải có data");
    assert.ok(body.data.ai, "phải có cấu hình AI");
    const serialized = JSON.stringify(body);
    assert.ok(!/sk-|apiKey|api_key/i.test(serialized), "không được chứa API key");
  });

  it("có cờ syncApiProtected (boolean)", async () => {
    const res = await statusGET();
    const body = await res.json();
    assert.equal(typeof body.data.syncApiProtected, "boolean");
  });
});

describe("GET /api/health", () => {
  it("200 + status ok/degraded + shape đầy đủ", async () => {
    const res = await healthGET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(["ok", "degraded"].includes(body.status), `status: ${body.status}`);
    assert.equal(body.database.ok, true);
    assert.equal(typeof body.uptimeSeconds, "number");
    assert.ok(body.draws, "phải có draw counts");
    assert.ok(body.dataQuality, "phải có quality audit");
    assert.equal(typeof body.ai.enabled, "boolean");
  });
});

describe("GET /api/accuracy", () => {
  it("type hợp lệ → 200 + shape thống kê", async () => {
    const res = await accuracyGET(req("/api/accuracy?type=MEGA_645"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data, "phải có data");
    assert.equal(typeof body.data.totalLogged, "number");
    assert.equal(typeof body.data.baseline, "number");
    assert.ok(Array.isArray(body.data.distribution));
  });

  it("type không hợp lệ → 400", async () => {
    const res = await accuracyGET(req("/api/accuracy?type=BAD"));
    assert.equal(res.status, 400);
  });
});

describe("POST /api/sync — token auth", () => {
  it("SYNC_API_TOKEN cấu hình + thiếu token → 401", async () => {
    process.env.SYNC_API_TOKEN = "test-secret-token";
    try {
      const res = await syncPOST(req("/api/sync"));
      assert.equal(res.status, 401);
    } finally {
      delete process.env.SYNC_API_TOKEN;
    }
  });

  it("SYNC_API_TOKEN cấu hình + đúng token → đi tiếp (400 với type lạ)", async () => {
    process.env.SYNC_API_TOKEN = "test-secret-token";
    try {
      const authorizedReq = new NextRequest(
        new Request("http://localhost/api/sync?type=NOT_REAL", {
          headers: { "x-api-token": "test-secret-token" },
        })
      );
      const res = await syncPOST(authorizedReq);
      // auth pass → rơi vào validation 400, KHÔNG phải 401
      assert.equal(res.status, 400);
    } finally {
      delete process.env.SYNC_API_TOKEN;
    }
  });
});

describe("GET /api/draws/latest", () => {
  it("type hợp lệ → 200, meta có lotteryType + totalRecords", async () => {
    const res = await latestGET(req("/api/draws/latest?type=MEGA_645"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.meta.lotteryType, "MEGA_645");
    assert.equal(typeof body.meta.totalRecords, "number");
    // data có thể null nếu DB trống, nhưng khi có phải đúng shape
    if (body.data) {
      assert.ok(body.data.drawNumber);
      assert.ok(Array.isArray(body.data.numbers));
    }
  });

  it("bỏ trống type → mặc định MEGA_645, 200", async () => {
    const res = await latestGET(req("/api/draws/latest"));
    assert.equal(res.status, 200);
  });

  it("type không hợp lệ → 400 (không crash 500)", async () => {
    const res = await latestGET(req("/api/draws/latest?type=INVALID"));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("không hợp lệ"));
  });
});

describe("GET /api/draws/history", () => {
  it("type hợp lệ → 200 + mảng kết quả + phân trang", async () => {
    const res = await historyGET(req("/api/draws/history?type=MEGA_645&limit=5"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.meta.hasMore, body.data.length < body.meta.total);
  });

  it("type không hợp lệ → 400", async () => {
    const res = await historyGET(req("/api/draws/history?type=XYZ"));
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes("không hợp lệ"));
  });
});

describe("GET /api/prediction", () => {
  it("type không hợp lệ → 400", async () => {
    const res = await predGET(req("/api/prediction?type=POWER999"));
    assert.equal(res.status, 400);
  });

  it("method lạ → vẫn xử lý an toàn (không 500)", async () => {
    const res = await predGET(req("/api/prediction?method=WHAT"));
    // method lạ rơi vào default hoặc trả lỗi nghiệp vụ, không được 500 crash
    assert.notEqual(res.status, 500);
  });
});

describe("GET /api/ai-prediction", () => {
  it("type không hợp lệ → 400", async () => {
    const res = await aiPredGET(req("/api/ai-prediction?type=NOPE"));
    assert.equal(res.status, 400);
  });
});

describe("POST /api/sync — validation", () => {
  it("type không hợp lệ → 400, không kích hoạt scrape", async () => {
    const res = await syncPOST(req("/api/sync?type=NOT_REAL"));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("không hợp lệ"));
  });
});
