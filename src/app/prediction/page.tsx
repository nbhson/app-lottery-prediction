/**
 * Trang dự đoán — phương pháp tần suất, gap, kết hợp
 * Có cảnh báo rõ ràng: không đảm bảo trúng
 * UI: Flat Design 2.0 — màu phẳng, micro-shadow, stat bars trực quan
 */
"use client";

import { useState, useEffect } from "react";
import { LOTTERY_RULES, LotteryType, Prediction, FrequencyStats } from "@/types/lottery";
import LotteryBall from "@/components/LotteryBall";

/** Response shape của GET /api/accuracy */
interface AccuracyStats {
  totalLogged: number;
  totalGraded: number;
  totalPending: number;
  avgMatches: number | null;
  baseline: number;
  lift: number | null;
  distribution: Array<{ matches: number; count: number }>;
  bestMatches: number | null;
}

const METHOD_LABELS: Record<string, string> = {
  FREQUENCY: "Tần suất (số hay ra)",
  GAP: "Khoảng trống (số lâu chưa ra)",
  FREQUENCY_AND_GAP: "Kết hợp (tần suất + khoảng trống)",
};

/** Confidence → badge màu: <30 danger, <45 warning, còn lại success */
function confidenceBadge(c: number): string {
  if (c < 30) return "badge badge-danger";
  if (c < 45) return "badge badge-warning";
  return "badge badge-success";
}

/** Chuyển count/gap thành % chiều dài bar để trực quan hóa */
function toBarWidth(v: number, max: number): number {
  if (max <= 0) return 8;
  return Math.max(8, Math.round((v / max) * 100));
}

export default function PredictionPage() {
  const [selectedType, setSelectedType] = useState<LotteryType>("MEGA_645");
  const [method, setMethod] = useState<string>("FREQUENCY_AND_GAP");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [hotNumbers, setHotNumbers] = useState<FrequencyStats[]>([]);
  const [coldNumbers, setColdNumbers] = useState<FrequencyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyStats | null>(null);

  const fetchPrediction = async (type: LotteryType, m: string) => {
    setSelectedType(type);
    setMethod(m);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prediction?type=${type}&method=${m}`);
      const json = await res.json();
      if (json.error || !json.data) {
        setError(json.error ?? "Chưa có đủ dữ liệu");
        setPrediction(null);
      } else {
        setPrediction(json.data);
        setHotNumbers(json.hotNumbers ?? []);
        setColdNumbers(json.coldNumbers ?? []);
      }
    } catch {
      setError("Lỗi kết nối server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }

    // Accuracy stats — lỗi thì im lặng (không quan trọng bằng dự đoán chính)
    try {
      const res = await fetch(`/api/accuracy?type=${type}`);
      const json = await res.json();
      setAccuracy(json.data ?? null);
    } catch {
      setAccuracy(null);
    }
  };

  // Load mặc định khi mount
  useEffect(() => {
    queueMicrotask(() => {
      fetchPrediction("MEGA_645", "FREQUENCY_AND_GAP");
    });
  }, []);

  const maxHotCount = Math.max(...hotNumbers.slice(0, 5).map((s) => s.count), 1);
  const maxColdGap = Math.max(...coldNumbers.slice(0, 5).map((s) => s.gap), 1);
  return (
    <>
      <div className="warning-banner" role="alert">
        <strong>⚠️ Cảnh báo quan trọng:</strong> Dự đoán dưới đây chỉ là{" "}
        <strong>thống kê</strong> dựa trên dữ liệu lịch sử. Xổ số Vietlott là{" "}
        <strong>ngẫu nhiên hoàn toàn</strong> — mỗi kỳ quay độc lập với các kỳ
        trước. <strong>Không có phương pháp nào đảm bảo trúng.</strong> Hãy chơi
        có trách nhiệm.
      </div>

      <h1 style={{ marginBottom: "var(--space-6)" }}>Dự đoán xổ số</h1>

      {/* Chọn loại hình */}
      <div className="type-selector" role="tablist" aria-label="Loại hình xổ số">
        {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
          <button
            key={key}
            role="tab"
            aria-selected={selectedType === key}
            className={`type-btn${selectedType === key ? " active" : ""}`}
            onClick={() => fetchPrediction(key as LotteryType, method)}
          >
            {rule.nameVi}
          </button>
        ))}
      </div>

      {/* Chọn phương pháp */}
      <div className="type-selector" role="tablist" aria-label="Phương pháp dự đoán">
        {Object.entries(METHOD_LABELS).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={method === key}
            className={`type-btn${method === key ? " active" : ""}`}
            onClick={() => fetchPrediction(selectedType, key)}
            style={{ fontSize: "var(--text-xs)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card card-accent text-center" aria-busy="true">
          <div className="ball-row" style={{ margin: "var(--space-6) 0" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton skeleton-ball" />
            ))}
          </div>
          <div className="skeleton skeleton-text" style={{ width: "60%", margin: "0 auto" }} />
        </div>
      ) : error ? (
        <div className="card">
          <p className="error-text" role="alert">{error}</p>
          <div className="text-center">
            <button className="btn" onClick={() => fetchPrediction(selectedType, method)}>
              🔄 Thử lại
            </button>
          </div>
        </div>
      ) : prediction ? (
        <>
          {/* Bộ số dự đoán */}
          <div className="card card-accent" style={{ textAlign: "center" }}>
            <div className="card-header" style={{ justifyContent: "center" }}>
              <h2>🎯 Bộ số dự đoán — {LOTTERY_RULES[selectedType].nameVi}</h2>
            </div>
            <p className="text-muted" style={{ marginBottom: "var(--space-4)" }}>
              Phương pháp: <strong>{METHOD_LABELS[prediction.method]}</strong>
            </p>
            <div className="ball-row" style={{ margin: "var(--space-6) 0" }}>
              {prediction.numbers.map((n, i) => (
                <LotteryBall key={`${n}-${i}`} n={n} delay={i * 70} />
              ))}
            </div>

            {/* Độ tin cậy tương đối */}
            <div
              style={{
                marginTop: "var(--space-4)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "var(--space-2)",
                flexWrap: "wrap",
              }}
            >
              <span className="text-muted">Độ tin cậy tương đối:</span>
              <span className={confidenceBadge(prediction.confidence)}>
                {prediction.confidence}%
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                (tương đối giữa các phương pháp — KHÔNG phải xác suất trúng)
              </span>
            </div>

            <div className="muted-box" style={{ marginTop: "var(--space-4)", textAlign: "left" }}>
              📊 <strong>Cách tính:</strong> {prediction.description}
            </div>
          </div>

          {/* Số nóng & lạnh với stat bars */}
          <div className="grid-2">
            <section className="card" aria-label="Số nóng">
              <h2 style={{ marginBottom: "var(--space-4)" }}>🔥 Số nóng (ra nhiều)</h2>
              <ul className="stat-list">
                {hotNumbers.slice(0, 5).map((s) => (
                  <li className="stat-item" key={s.number}>
                    <span className="stat-number">{s.number}</span>
                    <span className="stat-bar-track">
                      <span
                        className="stat-bar"
                        style={{ width: `${toBarWidth(s.count, maxHotCount)}%` }}
                      />
                    </span>
                    <span className="text-muted">{s.count} lần</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2 style={{ marginBottom: "var(--space-4)" }}>❄️ Số lạnh (lâu chưa ra)</h2>
              <ul className="stat-list">
                {coldNumbers.slice(0, 5).map((s) => (
                  <li className="stat-item" key={s.number}>
                    <span className="stat-number cold">{s.number}</span>
                    <span className="stat-bar-track">
                      <span
                        className="stat-bar cold"
                        style={{ width: `${toBarWidth(s.gap, maxColdGap)}%` }}
                      />
                    </span>
                    <span className="text-muted">gap {s.gap}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Độ chính xác dự đoán — accuracy tracking */}
          <section className="card" aria-label="Độ chính xác dự đoán">
            <h2 style={{ marginBottom: "var(--space-4)" }}>
              📏 Độ chính xác dự đoán (tự động chấm khi có kỳ mới)
            </h2>
            {accuracy && accuracy.totalLogged > 0 ? (
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-6)",
                    flexWrap: "wrap",
                    marginBottom: "var(--space-4)",
                  }}
                >
                  <div>
                    <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                      Đã chấm / Tổng log
                    </div>
                    <strong>
                      {accuracy.totalGraded} / {accuracy.totalLogged}
                    </strong>
                    {accuracy.totalPending > 0 && (
                      <span className="text-muted"> ({accuracy.totalPending} chờ kỳ mới)</span>
                    )}
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                      TB số trúng/kỳ
                    </div>
                    <strong>{accuracy.avgMatches ?? "—"}</strong>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                      Kỳ vọng ngẫu nhiên
                    </div>
                    <strong>{accuracy.baseline}</strong>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: "var(--text-xs)" }}>
                      Lift (TB / random)
                    </div>
                    <strong>{accuracy.lift ?? "—"}</strong>
                  </div>
                </div>
                <p
                  className="text-muted"
                  style={{ fontSize: "var(--text-xs)", margin: 0 }}
                >
                  Lift ≈ 1 nghĩa là phương pháp <strong>không nhỉnh hơn chọn ngẫu nhiên</strong> —
                  đúng bản chất xác suất của xổ số. Lift chỉ là quan sát quá khứ, không dự báo tương lai.
                </p>
              </div>
            ) : (
              <p className="text-muted" style={{ margin: 0 }}>
                Chưa có dữ liệu độ chính xác — hệ thống tự ghi log mỗi lần dự đoán và chấm
                điểm khi kỳ kết quả mới được đồng bộ. Quay lại sau vài kỳ để xem xu hướng.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="card text-center">
          <p className="text-muted">Chọn loại hình và phương pháp để xem dự đoán.</p>
        </div>
      )}
    </>
  );
}
