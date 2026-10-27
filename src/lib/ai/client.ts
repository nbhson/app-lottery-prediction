/**
 * AI Client — OpenAI-compatible chat completions API
 * Cấu hình qua .env: AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_TEMPERATURE, AI_TIMEOUT_MS
 * Fallback an toàn: nếu AI lỗi/timeout/thiếu config → trả { success: false },
 * caller dùng thống kê (prediction dựa trên tần suất/gap) thay thế.
 *
 * KHÔNG BAO GIỜ log hoặc trả về API key.
 */

import { getConfig } from "@/lib/config";

/** Kết quả gọi AI — luôn có success, lỗi mô tả bằng error code rõ ràng */
export interface AICompletionResult {
  success: boolean;
  content?: string;
  error?: string;
  model?: string;
  latencyMs?: number;
}

/** Trạng thái cấu hình AI — không chứa API key */
export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
}

/** Options cho chatCompletion */
export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Error codes trả về qua AICompletionResult.error */
export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_TIMEOUT"
  | "AI_HTTP_ERROR"
  | "AI_PARSE_ERROR"
  | "AI_NETWORK_ERROR";

/** Cấu trúc response chuẩn OpenAI chat completions */
interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string };
}

/** HTTP status được coi là lỗi tạm thời — có thể retry */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Gọi chat completions chuẩn OpenAI-compatible.
 *
 * - Thiếu AI_API_KEY → { success: false, error: "AI_NOT_CONFIGURED" }
 * - Timeout → "AI_TIMEOUT"
 * - HTTP lỗi (kể cả sau 1 lần retry với 429/5xx) → "AI_HTTP_ERROR"
 * - Response sai định dạng → "AI_PARSE_ERROR"
 *
 * Không bao giờ throw — mọi lỗi được bọc trong kết quả trả về.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: ChatCompletionOptions
): Promise<AICompletionResult> {
  const config = getConfig();

  // 1. Thiếu API key → AI không khả dụng
  if (!config.ai.enabled || !config.ai.apiKey) {
    return { success: false, error: "AI_NOT_CONFIGURED" };
  }

  const url = `${config.ai.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const maxAttempts = 2; // 1 lần chính + 1 lần retry

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: config.ai.model,
          temperature: options?.temperature ?? config.ai.temperature,
          max_tokens: options?.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(config.ai.timeoutMs),
      });

      // Lỗi HTTP tạm thời (429/5xx) → retry 1 lần
      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          continue;
        }
        return {
          success: false,
          error: `AI_HTTP_ERROR:${response.status}`,
          model: config.ai.model,
          latencyMs: Date.now() - startedAt,
        };
      }

      // Parse JSON — lỗi parse → không retry (response cứng, gọi lại cũng vậy)
      let payload: OpenAIChatResponse;
      try {
        payload = (await response.json()) as OpenAIChatResponse;
      } catch {
        return {
          success: false,
          error: "AI_PARSE_ERROR",
          model: config.ai.model,
          latencyMs: Date.now() - startedAt,
        };
      }

      // Lỗi nghiệp vụ từ API (trả 200 nhưng body có error)
      if (payload.error) {
        // 429-style từ body → thử retry 1 lần
        if (attempt < maxAttempts) {
          continue;
        }
        return {
          success: false,
          error: "AI_HTTP_ERROR",
          model: config.ai.model,
          latencyMs: Date.now() - startedAt,
        };
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        return {
          success: false,
          error: "AI_PARSE_ERROR",
          model: config.ai.model,
          latencyMs: Date.now() - startedAt,
        };
      }

      return {
        success: true,
        content,
        model: config.ai.model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      // Timeout (AbortSignal.timeout ném TimeoutError/DOMException) → retry 1 lần
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      if (isTimeout) {
        if (attempt < maxAttempts) continue;
        return {
          success: false,
          error: "AI_TIMEOUT",
          model: config.ai.model,
          latencyMs: Date.now() - startedAt,
        };
      }

      // Lỗi mạng/fetch khác — không xác định được bản chất, không retry
      return {
        success: false,
        error: "AI_HTTP_ERROR",
        model: config.ai.model,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // Không bao giờ tới đây (mọi nhánh đã return), nhưng để thỏa TS
  return { success: false, error: "AI_HTTP_ERROR" };
}

/**
 * Trạng thái cấu hình AI — dùng cho endpoint /api/ai/status.
 * KHÔNG bao giờ trả về API key.
 */
export function getAIStatus(): AIStatus {
  const config = getConfig();
  return {
    enabled: config.ai.enabled,
    provider: config.ai.provider,
    model: config.ai.model,
    baseUrl: config.ai.baseUrl,
  };
}
