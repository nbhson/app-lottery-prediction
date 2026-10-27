/**
 * Cấu hình ứng dụng — đọc từ .env với validation
 * Enterprise standard: fail-fast khi thiếu config bắt buộc, cảnh báo khi thiếu config tùy chọn
 *
 * Lưu ý: KHÔNG dùng package dotenv — Next.js tự động load .env, .env.local
 * từ process.env, module này chỉ đọc và validate.
 */

export interface AppConfig {
  ai: {
    provider: string;
    apiKey: string | null;
    baseUrl: string;
    model: string;
    temperature: number;
    timeoutMs: number;
    enabled: boolean; // true chỉ khi có AI_API_KEY
  };
  dataSource: {
    source: string;
    customUrl: string | null;
    syncIntervalMinutes: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  nodeEnv: string;
}

/** Base URL mặc định theo provider (chuẩn OpenAI-compatible) */
const DEFAULT_AI_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

/** Các nguồn dữ liệu hợp lệ cho DATA_SOURCE */
const VALID_DATA_SOURCES = ["vietlott_en", "custom"] as const;

/** Provider AI đã biết — dùng để cảnh báo khi cấu hình sai tên */
const KNOWN_AI_PROVIDERS = Object.keys(DEFAULT_AI_BASE_URLS);

/**
 * Lấy base URL mặc định theo provider.
 * Provider không xác định → fallback về OpenRouter.
 */
function defaultBaseForProvider(provider: string): string {
  return DEFAULT_AI_BASE_URLS[provider] ?? "https://openrouter.ai/api/v1";
}

/**
 * Parse số thực từ env với giá trị fallback và giới hạn min/max.
 * Không crash: giá trị không hợp lệ (NaN) → dùng fallback.
 */
function parseNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = parseFloat(value ?? "");
  if (isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Parse số nguyên từ env với giá trị fallback.
 * Giá trị không hợp lệ (NaN, <= 0) → dùng fallback.
 */
function parseIntSafe(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);
  if (isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Lấy cấu hình ứng dụng từ process.env.
 * An toàn để gọi nhiều lần (không side-effect, không cache — luôn đọc env mới nhất).
 */
export function getConfig(): AppConfig {
  const env = process.env;

  // ===== AI config — không bắt buộc, thiếu API key thì AI bị disable =====
  const apiKey = env.AI_API_KEY?.trim() || null;
  const provider = (env.AI_PROVIDER?.trim() || "openrouter").toLowerCase();
  const defaultBase = defaultBaseForProvider(provider);

  // Cảnh báo cấu hình tùy chọn sai (không crash)
  if (!DEFAULT_AI_BASE_URLS[provider]) {
    console.warn(
      `[config] AI_PROVIDER "${provider}" không nằm trong danh sách hỗ trợ ` +
        `(${KNOWN_AI_PROVIDERS.join(", ")}). Dùng baseUrl mặc định của OpenRouter.`
    );
  }

  // ===== Data source config =====
  const dataSource = env.DATA_SOURCE?.trim() || "vietlott_en";
  if (dataSource === "custom" && !env.DATA_SOURCE_URL?.trim()) {
    console.warn(
      '[config] DATA_SOURCE="custom" nhưng thiếu DATA_SOURCE_URL — sync sẽ thất bại khi chạy.'
    );
  } else if (!(VALID_DATA_SOURCES as readonly string[]).includes(dataSource)) {
    console.warn(
      `[config] DATA_SOURCE "${dataSource}" không nhận diện được ` +
        `(hợp lệ: ${VALID_DATA_SOURCES.join(", ")}). Dùng giá trị đó nguyên văn.`
    );
  }

  return {
    ai: {
      provider,
      apiKey,
      baseUrl: env.AI_BASE_URL?.trim() || defaultBase,
      model: env.AI_MODEL?.trim() || "gpt-4o-mini",
      temperature: parseNumber(env.AI_TEMPERATURE, 0.7, 0, 2),
      timeoutMs: parseIntSafe(env.AI_TIMEOUT_MS, 30000),
      enabled: apiKey !== null,
    },
    dataSource: {
      source: dataSource,
      customUrl: env.DATA_SOURCE_URL?.trim() || null,
      syncIntervalMinutes: parseIntSafe(env.DATA_SYNC_INTERVAL_MINUTES, 30),
      maxRetries: parseIntSafe(env.FETCH_MAX_RETRIES, 3),
      retryDelayMs: parseIntSafe(env.FETCH_RETRY_DELAY_MS, 2000),
    },
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
