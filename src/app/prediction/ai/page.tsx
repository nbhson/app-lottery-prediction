/**
 * Trang dự đoán AI — kết hợp thống kê + AI (OpenAI-compatible)
 * Fallback: AI lỗi → trả thống kê, kèm trạng thái lỗi minh bạch
 * UI: Flat Design 2.0 — accent tím riêng cho khối AI
 */

"use client";

import { useState, useEffect } from "react";
import { LOTTERY_RULES, LotteryType } from "@/types/lottery";
import LotteryBall from "@/components/LotteryBall";

interface AIPredictionResponse {
  lotteryType: string;
  statistical: {
    numbers: number[];
    method: string;
    confidence: number;
    description: string;
  };
  hotNumbers: Array<{ number: number; count: number; gap: number }>;
  coldNumbers: Array<{ number: number; count: number; gap: number }>;
  recentDraws: Array<{ drawNumber: string; drawDate: string; numbers: number[] }>;
  aiUsed: boolean;
  aiError?: string;
  ai: {
    numbers: number[];
    reasoning: string;
    model?: string;
    latencyMs?: number;
  } | null;
  disclaimer: string;
}

export default function AIPredictionPage() {
  const [selectedType, setSelectedType] = useState<LotteryType>("MEGA_645");
  const [result, setResult] = useState<AIPredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState("");

  const fetchPrediction = async (type: LotteryType, favs?: string) => {
    setSelectedType(type);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (favs) params.set("favorites", favs);
      const res = await fetch(`/api/ai-prediction?${params.toString()}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setResult(null);
      } else {
        setResult(json.data);
      }
    } catch {
      setError("Lỗi kết nối server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Load mặc định khi mount
  useEffect(() => {
    queueMicrotask(() => {
      fetchPrediction("MEGA_645");
    });
  }, []);

  return (
    <>
      <div className="warning-banner" role="alert">
        <strong>⚠️ Cảnh báo quan trọng:</strong> Dự đoán dưới đây chỉ là{" "}
        <strong>thống kê + gợi ý AI</strong>. Xổ số Vietlott là{" "}
        <strong>ngẫu nhiên hoàn toàn</strong> — mỗi kỳ quay độc lập.{" "}
        <strong>Không đảm bảo trúng.</strong> Hãy chơi có trách nhiệm.
      </div>

      <h1 style={{ marginBottom: "var(--space-6)" }}>🤖 Dự đoán AI + Thống kê</h1>

      {/* Chọn loại hình */}
      <div className="type-selector" role="tablist" aria-label="Loại hình xổ số">
        {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
          <button
            key={key}
            role="tab"
            aria-selected={selectedType === key}
            className={`type-btn${selectedType === key ? " active" : ""}`}
            onClick={() => fetchPrediction(key as LotteryType, favorites)}
          >
            {rule.nameVi}
          </button>
        ))}
      </div>

      {/* Số yêu thích */}
      <div className="card">
        <label htmlFor="favorites" className="label">
          Số yêu thích (tùy chọn — phân cách bằng dấu phẩy, vd: 3,14,27):
        </label>
        <input
          id="favorites"
          type="text"
          className="input"
          value={favorites}
          onChange={(e) => setFavorites(e.target.value)}
          placeholder="3,14,27"
          style={{ maxWidth: "320px", marginBottom: "var(--space-3)" }}
          inputMode="numeric"
        />
        <div>
          <button
            className="btn"
            onClick={() => fetchPrediction(selectedType, favorites)}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm" aria-hidden="true" /> Đang phân tích…
              </>
            ) : (
              <>🎯 Dự đoán ngay</>
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading" role="status">
          <span className="spinner" aria-hidden="true" />
          AI đang phân tích dữ liệu lịch sử…
        </div>
      )}
      {error && (
        <div className="card">
          <p className="error-text" role="alert">{error}</p>
        </div>
      )}

      {/* Kết quả */}
      {result && !loading && (
        <>
          {/* Trạng thái AI minh bạch */}
          <div
            className={result.aiUsed ? "info-banner" : "warning-banner"}
            role="status"
          >
            {result.aiUsed && result.ai ? (
              <>
                🤖 <strong>AI đã tham gia:</strong> {result.ai.model}
                {result.ai.latencyMs !== undefined && (
                  <span className="badge badge-purple" style={{ marginLeft: "var(--space-2)" }}>
                    {result.ai.latencyMs}ms
                  </span>
                )}
              </>
            ) : (
              <>
                📊 <strong>Chỉ dùng thống kê.</strong> Lý do: {result.aiError ?? "AI không khả dụng"}
                <br />
                <small>
                  Cấu hình AI qua <code>.env</code> (<code>AI_API_KEY</code>,{" "}
                  <code>AI_BASE_URL</code>, <code>AI_MODEL</code>) để bật dự đoán AI.
                </small>
              </>
            )}
          </div>

          {/* Dự đoán AI */}
          {result.ai && (
            <div className="card card-accent-ai" style={{ textAlign: "center" }}>
              <div className="card-header" style={{ justifyContent: "center" }}>
                <h2>🤖 Gợi ý từ AI</h2>
              </div>
              <div className="ball-row" style={{ margin: "var(--space-5) 0" }}>
                {result.ai.numbers.map((n, i) => (
                  <LotteryBall key={`ai-${i}-${n}`} n={n} delay={i * 70} />
                ))}
              </div>
              {result.ai.reasoning && (
                <div className="muted-box" style={{ textAlign: "left" }}>
                  💭 <strong>Lý do của AI:</strong> {result.ai.reasoning}
                </div>
              )}
            </div>
          )}

          {/* Dự đoán thống kê */}
          <div className="card card-accent" style={{ textAlign: "center" }}>
            <h2 style={{ marginBottom: "var(--space-4)" }}>📊 Dự đoán thống kê (tần suất + gap)</h2>
            <div className="ball-row" style={{ margin: "var(--space-5) 0" }}>
              {result.statistical.numbers.map((n, i) => (
                <LotteryBall key={`stat-${i}-${n}`} n={n} delay={i * 70} />
              ))}
            </div>
            <div className="muted-box" style={{ textAlign: "left" }}>
              📊 {result.statistical.description}
            </div>
          </div>

          {/* Số nóng / lạnh */}
          <div className="grid-2">
            <section className="card" aria-label="Số nóng">
              <h2 style={{ marginBottom: "var(--space-4)" }}>🔥 Số nóng</h2>
              <ul className="stat-list">
                {result.hotNumbers.slice(0, 5).map((s) => (
                  <li className="stat-item" key={`hot-${s.number}`}>
                    <span className="stat-number">{s.number}</span>
                    <span className="text-muted">{s.count} lần, gap {s.gap}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card" aria-label="Số lạnh">
              <h2 style={{ marginBottom: "var(--space-4)" }}>❄️ Số lạnh</h2>
              <ul className="stat-list">
                {result.coldNumbers.slice(0, 5).map((s) => (
                  <li className="stat-item" key={`cold-${s.number}`}>
                    <span className="stat-number cold">{s.number}</span>
                    <span className="text-muted">gap {s.gap}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="warning-banner" style={{ marginTop: "var(--space-5)" }}>
            {result.disclaimer}
          </div>
        </>
      )}
    </>
  );
}
