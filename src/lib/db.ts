/**
 * Module quản lý cơ sở dữ liệu — SQLite (better-sqlite3)
 *
 * Schema:
 * - draws: kết quả xổ số (lịch sử) — UNIQUE(draw_number, lottery_type) chống trùng lặp
 * - data_source: trạng thái nguồn dữ liệu (bản ghi duy nhất id = 1)
 * - sync_log: lịch sử các lần đồng bộ dữ liệu
 *
 * KHÔNG seed dữ liệu mẫu — dữ liệu chỉ đến từ nguồn sync thực tế.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DrawResult, LotteryType, DataSourceStatus } from "@/types/lottery";
import { invalidateDrawsCache } from "@/lib/cache";

/**
 * Thư mục chứa DB — override qua DATA_DIR (hữu ích khi chạy standalone/ Docker,
 * không phụ thuộc process.cwd()).
 */
const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "vietlott.db");

// Singleton cho database
let db: Database.Database | null = null;

/** Bản ghi sync_log (kết quả truy vấn) */
export interface SyncLogEntry {
  id: number;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  recordsAdded: number;
  errorMessage: string | null;
}

/** Bổ sung cho sync — trả về từ startSyncLog */
export interface SyncLogHandle {
  id: number;
}

/** Tham số hoàn tất một lần sync */
export interface FinishSyncParams {
  logId: number;
  status: "SUCCESS" | "FAILED";
  recordsAdded: number;
  errorMessage?: string | null;
}

/** Tham số setSyncStatus */
export interface SyncStatusParams {
  connected: boolean;
  source: string;
  note?: string;
}

/**
 * Lấy (hoặc tạo mới) kết nối SQLite — pattern Singleton.
 * Tự tạo thư mục `data/` nếu chưa tồn tại.
 */
export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    initSchema();
  }
  return db;
}

/** Schema mới của bảng draws — ràng buộc UNIQUE theo cặp (draw_number, lottery_type) */
const DRAWS_TABLE_SQL = `
  CREATE TABLE draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_number TEXT NOT NULL,
    lottery_type TEXT NOT NULL CHECK(lottery_type IN ('MEGA_645', 'POWER_655')),
    draw_date TEXT NOT NULL,
    numbers TEXT NOT NULL,
    bonus_number INTEGER,
    jackpot INTEGER DEFAULT 0,
    published INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    UNIQUE(draw_number, lottery_type)
  )
`;

function initSchema(): void {
  const database = db!;

  migrateDrawsTable(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_number TEXT NOT NULL,
      lottery_type TEXT NOT NULL CHECK(lottery_type IN ('MEGA_645', 'POWER_655')),
      draw_date TEXT NOT NULL,
      numbers TEXT NOT NULL,
      bonus_number INTEGER,
      jackpot INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(draw_number, lottery_type)
    );

    CREATE TABLE IF NOT EXISTS data_source (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      connected INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      last_sync TEXT,
      record_count INTEGER DEFAULT 0,
      note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'RUNNING'
        CHECK(status IN ('RUNNING', 'SUCCESS', 'FAILED')),
      records_added INTEGER DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS prediction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lottery_type TEXT NOT NULL CHECK(lottery_type IN ('MEGA_645', 'POWER_655')),
      method TEXT NOT NULL,
      numbers TEXT NOT NULL,
      confidence INTEGER,
      after_draw_number TEXT NOT NULL,
      after_draw_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      graded_draw_number TEXT,
      graded_draw_date TEXT,
      matches INTEGER,
      matched_numbers TEXT,
      graded_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_draws_type_date
      ON draws(lottery_type, draw_date DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_log_started
      ON sync_log(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_predlog_type_graded
      ON prediction_log(lottery_type, graded_at);
  `);

  // Đảm bảo bản ghi trạng thái nguồn dữ liệu tồn tại (không seed dữ liệu draws)
  database.prepare(
    `INSERT OR IGNORE INTO data_source (id, connected, source, last_sync, record_count, note)
     VALUES (1, 0, '', NULL, 0, 'Chưa đồng bộ dữ liệu')`
  ).run();
}

/**
 * Migration: nếu bảng draws đã tồn tại theo schema cũ
 * (draw_number UNIQUE đơn lẻ thay vì UNIQUE cặp với lottery_type),
 * dựng lại bảng để hỗ trợ cùng 1 số kỳ ở 2 loại hình khác nhau.
 */
function migrateDrawsTable(database: Database.Database): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'draws'")
    .get() as { sql: string } | undefined;

  if (!row) return; // bảng chưa tồn tại — CREATE TABLE IF NOT EXISTS sẽ tạo mới

  const isOldSchema =
    row.sql.includes("draw_number TEXT UNIQUE NOT NULL") ||
    (!row.sql.includes("UNIQUE(draw_number, lottery_type)") &&
      !row.sql.includes("draw_number, lottery_type"));

  if (!isOldSchema) return;

  console.warn(
    "[db] Phát hiện schema 'draws' cũ (UNIQUE draw_number đơn lẻ) — đang migrate sang UNIQUE(draw_number, lottery_type)..."
  );

  const migrate = database.transaction(() => {
    database.exec("ALTER TABLE draws RENAME TO draws_old_migrate");
    database.exec(DRAWS_TABLE_SQL);
    database.exec(`
      INSERT OR IGNORE INTO draws
        (id, draw_number, lottery_type, draw_date, numbers, bonus_number, jackpot, published, created_at)
      SELECT id, draw_number, lottery_type, draw_date, numbers, bonus_number, jackpot, published, created_at
      FROM draws_old_migrate
      ORDER BY id ASC
    `);
    database.exec("DROP TABLE draws_old_migrate");
  });

  migrate();
}

// ============================================================
// Ghi dữ liệu
// ============================================================

/**
 * Upsert 1 kỳ kết quả vào bảng draws.
 * Dùng INSERT OR IGNORE với UNIQUE(draw_number, lottery_type) → chống trùng lặp.
 *
 * @returns { inserted: true } nếu chèn mới, { inserted: false } nếu kỳ đã tồn tại
 */
export function upsertDraw(draw: Omit<DrawResult, "id">): { inserted: boolean } {
  const result = getDb()
    .prepare(
      `
      INSERT OR IGNORE INTO draws
        (draw_number, lottery_type, draw_date, numbers, bonus_number, jackpot, published)
      VALUES
        (@drawNumber, @lotteryType, @drawDate, @numbers, @bonusNumber, @jackpot, @published)
    `
    )
    .run({
      drawNumber: draw.drawNumber,
      lotteryType: draw.lotteryType,
      drawDate: draw.drawDate,
      numbers: JSON.stringify(draw.numbers),
      bonusNumber: draw.bonusNumber ?? null,
      jackpot: draw.jackpot,
      published: draw.published ? 1 : 0,
    });

  const inserted = result.changes > 0;
  if (inserted) invalidateDrawsCache();
  return { inserted };
}

/**
 * Upsert N kỳ trong MỘT transaction — dùng cho backfill lịch sử
 * (hàng nghìn row, 1 prepared statement + 1 transaction = nhanh).
 * Dùng INSERT OR IGNORE với UNIQUE(draw_number, lottery_type) → chống trùng.
 *
 * @returns số bản ghi thực sự chèn mới
 */
export function insertDrawsMany(
  draws: Array<Omit<DrawResult, "id">>
): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO draws
      (draw_number, lottery_type, draw_date, numbers, bonus_number, jackpot, published)
    VALUES
      (@drawNumber, @lotteryType, @drawDate, @numbers, @bonusNumber, @jackpot, @published)
  `);

  let inserted = 0;
  const insertAll = db.transaction(
    (rows: Array<Omit<DrawResult, "id">>) => {
      for (const draw of rows) {
        const result = stmt.run({
          drawNumber: draw.drawNumber,
          lotteryType: draw.lotteryType,
          drawDate: draw.drawDate,
          numbers: JSON.stringify(draw.numbers),
          bonusNumber: draw.bonusNumber ?? null,
          jackpot: draw.jackpot,
          published: draw.published ? 1 : 0,
        });
        inserted += result.changes;
      }
    }
  );

  insertAll(draws);
  if (inserted > 0) invalidateDrawsCache();
  return inserted;
}

// ============================================================
// Truy vấn
// ============================================================

/** Lấy kết quả mới nhất theo loại hình */
export function getLatestDraw(type: LotteryType): DrawResult | null {
  const row = getDb()
    .prepare(
      `
      SELECT id, draw_number, lottery_type, draw_date, numbers,
             bonus_number, jackpot, published
      FROM draws
      WHERE lottery_type = ?
      ORDER BY draw_date DESC
      LIMIT 1
    `
    )
    .get(type) as DrawRow | undefined;

  return row ? mapRowToDrawResult(row) : null;
}

/** Lấy lịch sử kết quả có phân trang (mới nhất trước) */
export function getDrawHistory(
  type: LotteryType,
  limit: number = 10,
  offset: number = 0
): DrawResult[] {
  const rows = getDb()
    .prepare(
      `
      SELECT id, draw_number, lottery_type, draw_date, numbers,
             bonus_number, jackpot, published
      FROM draws
      WHERE lottery_type = ? AND published = 1
      ORDER BY draw_date DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(type, limit, offset) as DrawRow[];

  return rows.map(mapRowToDrawResult);
}

/**
 * Lấy N kỳ gần nhất phục vụ AI (sắp xếp cũ → mới để AI đọc theo trình tự thời gian).
 * Chỉ lấy kỳ đã publish.
 */
export function getDrawsForAI(type: LotteryType, limit: number = 20): DrawResult[] {
  const rows = getDb()
    .prepare(
      `
      SELECT id, draw_number, lottery_type, draw_date, numbers,
             bonus_number, jackpot, published
      FROM (
        SELECT * FROM draws
        WHERE lottery_type = ? AND published = 1
        ORDER BY draw_date DESC
        LIMIT ?
      )
      ORDER BY draw_date ASC
    `
    )
    .all(type, limit) as DrawRow[];

  return rows.map(mapRowToDrawResult);
}

/** Lấy kết quả cũ nhất theo loại hình (dùng cho backfill chain) */
export function getOldestDraw(type: LotteryType): DrawResult | null {
  const row = getDb()
    .prepare(
      `
      SELECT id, draw_number, lottery_type, draw_date, numbers,
             bonus_number, jackpot, published
      FROM draws
      WHERE lottery_type = ?
      ORDER BY draw_date ASC
      LIMIT 1
    `
    )
    .get(type) as DrawRow | undefined;

  return row ? mapRowToDrawResult(row) : null;
}

/** Đếm tổng số kỳ của 1 loại hình */
export function countDraws(type: LotteryType): number {
  return (
    (getDb()
      .prepare(
        "SELECT COUNT(*) as c FROM draws WHERE lottery_type = ? AND published = 1"
      )
      .get(type) as { c: number })?.c ?? 0
  );
}

// ============================================================
// Trạng thái nguồn dữ liệu (bảng data_source)
// ============================================================

/** Trạng thái nguồn dữ liệu hiện tại */
export function getSyncStatus(): DataSourceStatus {
  const row = getDb()
    .prepare("SELECT * FROM data_source WHERE id = 1")
    .get() as {
      connected: number;
      source: string;
      last_sync: string | null;
      record_count: number;
      note: string;
    } | undefined;

  if (!row) {
    return {
      connected: false,
      source: "unknown",
      lastSync: null,
      recordCount: 0,
      note: "Chưa có thông tin nguồn dữ liệu",
    };
  }

  return {
    connected: row.connected === 1,
    source: row.source,
    lastSync: row.last_sync,
    recordCount: row.record_count,
    note: row.note,
  };
}

/**
 * Cập nhật trạng thái đồng bộ của nguồn dữ liệu (bảng data_source, id = 1).
 * Gọi sau mỗi lần sync (thành công hoặc thất bại).
 */
export function setSyncStatus(params: SyncStatusParams): void {
  const { connected, source, note } = params;

  getDb()
    .prepare(
      `
      INSERT INTO data_source (id, connected, source, last_sync, record_count, note)
      VALUES (1, @connected, @source, datetime('now', '+7 hours'), @recordCount, @note)
      ON CONFLICT(id) DO UPDATE SET
        connected = @connected,
        source = @source,
        last_sync = datetime('now', '+7 hours'),
        record_count = @recordCount,
        note = @note
    `
    )
    .run({
      connected: connected ? 1 : 0,
      source,
      recordCount: countDraws("MEGA_645") + countDraws("POWER_655"),
      note: note ?? "",
    });
}

/** Trạng thái nguồn dữ liệu — alias giữ tương thích với code cũ */
export function getDataSourceStatus(): DataSourceStatus {
  return getSyncStatus();
}

// ============================================================
// Sync log (bảng sync_log)
// ============================================================

/**
 * Bắt đầu 1 lần sync — tạo bản ghi sync_log trạng thái RUNNING.
 * Trả về handle (id) để truyền vào finishSyncLog.
 */
export function startSyncLog(source: string): SyncLogHandle {
  const result = getDb()
    .prepare("INSERT INTO sync_log (source) VALUES (?)")
    .run(source);
  return { id: Number(result.lastInsertRowid) };
}

/**
 * Kiểm tra có lần sync RUNNING gần đây (trong `staleMinutes` phút) hay không.
 * Dùng làm khóa liên tiến trình: nhiều instance Next.js cùng chạy thì
 * process nào thấy RUNNING còn tươi sẽ nhường, tránh scrape trùng nhau.
 */
export function hasRecentRunningSync(staleMinutes: number): boolean {
  const row = getDb()
    .prepare(
      `
      SELECT COUNT(*) as c FROM sync_log
      WHERE status = 'RUNNING'
        AND started_at >= datetime('now', '+7 hours', ?)
    `
    )
    .get(`-${staleMinutes} minutes`) as { c: number };
  return row.c > 0;
}

/**
 * Hoàn tất 1 lần sync — cập nhật bản ghi sync_log.
 */
export function finishSyncLog(params: FinishSyncParams): void {
  getDb()
    .prepare(
      `
      UPDATE sync_log
      SET finished_at = datetime('now', '+7 hours'),
          status = @status,
          records_added = @recordsAdded,
          error_message = @errorMessage
      WHERE id = @logId
    `
    )
    .run({
      logId: params.logId,
      status: params.status,
      recordsAdded: params.recordsAdded,
      errorMessage: params.errorMessage ?? null,
    });
}

/** Lấy N lần sync gần nhất (mới nhất trước) */
export function getSyncLogs(limit: number = 20): SyncLogEntry[] {
  const rows = getDb()
    .prepare(
      `
      SELECT id, source, started_at, finished_at, status, records_added, error_message
      FROM sync_log
      ORDER BY started_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Array<{
      id: number;
      source: string;
      started_at: string;
      finished_at: string | null;
      status: SyncLogEntry["status"];
      records_added: number;
      error_message: string | null;
    }>;

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    recordsAdded: row.records_added,
    errorMessage: row.error_message,
  }));
}

// ============================================================
// Prediction log — theo dõi độ chính xác dự đoán (accuracy tracking)
// ============================================================

/** Tham số ghi 1 lần dự đoán vào prediction_log */
export interface PredictionLogParams {
  lotteryType: LotteryType;
  method: string;
  numbers: number[];
  confidence: number;
  /** Số kỳ mới nhất trong DB tại lúc dự đoán — dùng làm mốc chấm điểm */
  afterDrawNumber: string;
  afterDrawDate: string;
}

/**
 * Ghi 1 lần dự đoán vào prediction_log (chưa chấm — chờ kỳ mới để grade).
 * KHÔNG bao giờ throw — logging phải không bao giờ làm hỏng response chính.
 */
export function insertPredictionLog(params: PredictionLogParams): void {
  try {
    getDb()
      .prepare(
        `
      INSERT INTO prediction_log
        (lottery_type, method, numbers, confidence, after_draw_number, after_draw_date)
      VALUES
        (@lotteryType, @method, @numbers, @confidence, @afterDrawNumber, @afterDrawDate)
    `
      )
      .run({
        lotteryType: params.lotteryType,
        method: params.method,
        numbers: JSON.stringify(params.numbers),
        confidence: Math.round(params.confidence),
        afterDrawNumber: params.afterDrawNumber,
        afterDrawDate: params.afterDrawDate,
      });
  } catch (error) {
    console.error("[db] insertPredictionLog thất bại (bỏ qua):", error);
  }
}

/** Bản ghi prediction_log chưa chấm điểm (kết quả truy vấn) */
export interface PendingPredictionRow {
  id: number;
  lottery_type: LotteryType;
  method: string;
  numbers: string;
  confidence: number;
  after_draw_number: string;
  after_draw_date: string;
}

/**
 * Lấy các dự đoán chưa chấm điểm của 1 loại hình, tạo TRƯỚC kỳ `drawDate`.
 * Bất biến: chỉ chấm dự đoán được tạo trước ngày kỳ mới — backfill các kỳ cũ
 * (drawDate < after_draw_date) sẽ không kích hoạt chấm nhầm.
 */
export function getUngradedPredictions(
  lotteryType: LotteryType,
  newDrawDate: string,
  limit: number = 2000
): PendingPredictionRow[] {
  return getDb()
    .prepare(
      `
    SELECT id, lottery_type, method, numbers, confidence,
           after_draw_number, after_draw_date
    FROM prediction_log
    WHERE lottery_type = ?
      AND graded_at IS NULL
      AND after_draw_date < ?
    ORDER BY id ASC
    LIMIT ?
  `
    )
    .all(lotteryType, newDrawDate, limit) as PendingPredictionRow[];
}

/** Tham số chấm điểm 1 bản ghi dự đoán */
export interface GradePredictionParams {
  id: number;
  gradedDrawNumber: string;
  gradedDrawDate: string;
  matches: number;
  matchedNumbers: number[];
}

/** Chấm điểm 1 bản ghi — ghi kỳ thực tế + số lượng/kNhững số trúng */
export function gradePredictionLog(params: GradePredictionParams): void {
  getDb()
    .prepare(
      `
    UPDATE prediction_log
    SET graded_draw_number = @gradedDrawNumber,
        graded_draw_date = @gradedDrawDate,
        matches = @matches,
        matched_numbers = @matchedNumbers,
        graded_at = datetime('now', '+7 hours')
    WHERE id = @id
  `
    )
    .run({
      id: params.id,
      gradedDrawNumber: params.gradedDrawNumber,
      gradedDrawDate: params.gradedDrawDate,
      matches: params.matches,
      matchedNumbers: JSON.stringify(params.matchedNumbers),
    });
}

/** Giữ tối đa `keep` bản ghi mới nhất — chạy sau khi chấm để bảng không phình vô hạn */
export function prunePredictionLog(keep: number = 5000): void {
  getDb()
    .prepare(
      `
    DELETE FROM prediction_log
    WHERE id NOT IN (SELECT id FROM prediction_log ORDER BY id DESC LIMIT ?)
  `
    )
    .run(keep);
}

/** Row tổng hợp accuracy từ SQL */
export interface AccuracyAggregateRow {
  total: number;
  graded: number;
  pending: number | null;
  avg_matches: number | null;
  best: number | null;
}

/** Aggregate tổng hợp cho getAccuracyStats (lib/accuracy.ts) */
export function getAccuracyAggregate(
  lotteryType: LotteryType
): AccuracyAggregateRow {
  return getDb()
    .prepare(
      `
    SELECT COUNT(*) AS total,
           COUNT(matches) AS graded,
           SUM(CASE WHEN graded_at IS NULL THEN 1 ELSE 0 END) AS pending,
           AVG(matches) AS avg_matches,
           MAX(matches) AS best
    FROM prediction_log
    WHERE lottery_type = ?
  `
    )
    .get(lotteryType) as AccuracyAggregateRow;
}

/** Phân phối số trúng: [{matches, c}] — chỉ các matches đã chấm */
export function getAccuracyDistribution(
  lotteryType: LotteryType
): Array<{ matches: number; c: number }> {
  return getDb()
    .prepare(
      `
    SELECT matches, COUNT(*) AS c
    FROM prediction_log
    WHERE lottery_type = ? AND matches IS NOT NULL
    GROUP BY matches
    ORDER BY matches ASC
  `
    )
    .all(lotteryType) as Array<{ matches: number; c: number }>;
}

// ============================================================
// Helpers nội bộ
// ============================================================

/** Row thô từ bảng draws */
interface DrawRow {
  id: number;
  draw_number: string;
  lottery_type: LotteryType;
  draw_date: string;
  numbers: string;
  bonus_number: number | null;
  jackpot: number;
  published: number;
}

/** Map row SQLite → DrawResult */
function mapRowToDrawResult(row: DrawRow): DrawResult {
  return {
    id: row.id,
    drawNumber: row.draw_number,
    lotteryType: row.lottery_type,
    drawDate: row.draw_date,
    numbers: JSON.parse(row.numbers) as number[],
    bonusNumber: row.bonus_number ?? undefined,
    jackpot: row.jackpot,
    published: row.published === 1,
  };
}
