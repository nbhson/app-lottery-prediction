/**
 * HomeClient — phần tương tác của trang chủ (client component).
 * Nhận dữ liệu ban đầu từ Server Component (page.tsx) → lần render đầu
 * đã có kết quả thật, không cần fetch.
 * Khi user đổi loại hình / tải lại → fetch qua API như cũ.
 */
"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { LOTTERY_RULES, LotteryType, DrawResult, DataSourceStatus } from "@/types/lottery";
import LotteryBall from "@/components/LotteryBall";
import { formatDate, formatDbDate, formatVnd } from "@/lib/format";

interface HomeClientProps {
  initialData: DrawResult | null;
  initialStatus: DataSourceStatus;
}

export default function HomeClient({ initialData, initialStatus }: HomeClientProps) {
  const [selectedType, setSelectedType] = useState<LotteryType>("MEGA_645");
  const [data, setData] = useState<DrawResult | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DataSourceStatus | null>(initialStatus);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchLatest = useCallback(async (type: LotteryType) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/draws/latest?type=${type}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setData(null);
      } else {
        setData(json.data);
        setStatus(json.meta?.dataSource ?? null);
      }
    } catch {
      setError("Lỗi kết nối server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setToast(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      const inserted = json?.data?.totalInserted ?? 0;
      setToast(
        res.ok && !json?.data?.anyError
          ? { type: "success", message: `✅ Đồng bộ thành công — ${inserted} kỳ mới` }
          : { type: "error", message: "⚠️ Đồng bộ một phần thất bại — kiểm tra trạng thái nguồn" }
      );
      await fetchLatest(selectedType);
    } catch {
      setToast({ type: "error", message: "Lỗi kết nối khi đồng bộ" });
    } finally {
      setSyncing(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <>
      <div className="warning-banner" role="alert">
        <strong>⚠️ Cảnh báo:</strong> Đây là ứng dụng tham khảo. Dự đoán và
        thống kê <strong>không đảm bảo trúng</strong>. Xác suất mỗi bộ số là
        như nhau. 18+, chơi có trách nhiệm.
      </div>

      <h1 style={{ marginBottom: "var(--space-6)" }}>Kết quả xổ số Vietlott</h1>

      {/* Trạng thái nguồn dữ liệu */}
      {status && (
        <div className="info-banner" role="status">
          <span aria-hidden="true">📡</span> Nguồn:{" "}
          <strong>{status.source || "chưa xác định"}</strong>
          {status.note && <span> — {status.note}</span>}
          {status.lastSync && (
            <span style={{ marginLeft: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Lần đồng bộ: {formatDbDate(status.lastSync)}
            </span>
          )}
          <span style={{ marginLeft: "var(--space-2)" }}>
            {status.connected ? (
              <span className="badge badge-success">✓ Đã kết nối</span>
            ) : (
              <span className="badge badge-danger">⚠ Chưa kết nối</span>
            )}
          </span>
        </div>
      )}

      {/* Chọn loại hình */}
      <div className="type-selector" role="tablist" aria-label="Loại hình xổ số">
        {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
          <button
            key={key}
            role="tab"
            aria-selected={selectedType === key}
            className={`type-btn${selectedType === key ? " active" : ""}`}
            onClick={() => {
              setSelectedType(key as LotteryType);
              fetchLatest(key as LotteryType);
            }}
          >
            {rule.nameVi}
          </button>
        ))}
        <button
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={handleSync}
          disabled={syncing}
          aria-busy={syncing}
        >
          {syncing ? (
            <>
              <span className="spinner spinner-sm" aria-hidden="true" /> Đang đồng bộ…
            </>
          ) : (
            <>🔄 Đồng bộ ngay</>
          )}
        </button>
      </div>

      {/* Kết quả */}
      {loading ? (
        <div className="card card-accent" aria-busy="true" aria-label="Đang tải kết quả">
          <div className="card-header">
            <div className="skeleton skeleton-text" style={{ width: "220px" }} />
            <div className="skeleton" style={{ width: "140px", height: "28px" }} />
          </div>
          <div className="ball-row" style={{ margin: "var(--space-6) 0" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton skeleton-ball" />
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <div className="card text-center">
          <p className="error-text" role="alert">
            {error ?? "Chưa có dữ liệu — nhấn 'Đồng bộ ngay' để bắt đầu"}
          </p>
          <button className="btn" onClick={handleSync} disabled={syncing}>
            🔄 Đồng bộ từ vietlott.vn
          </button>
        </div>
      ) : (
        <div className="card card-accent">
          <div className="card-header">
            <div>
              <span className="badge badge-neutral" style={{ marginBottom: "var(--space-2)" }}>
                Kỳ #{data.drawNumber}
              </span>
              <h2 style={{ marginTop: "var(--space-2)" }}>{formatDate(data.drawDate)}</h2>
            </div>
            {data.jackpot > 0 && (
              <span className="badge badge-success" style={{ fontSize: "var(--text-sm)" }}>
                🏆 Jackpot: {formatVnd(data.jackpot)}
              </span>
            )}
          </div>

          <div>
            <p className="text-muted" style={{ marginBottom: "var(--space-3)" }}>
              Kết quả ({LOTTERY_RULES[selectedType].pickCount} số):
            </p>
            <div className="ball-row">
              {data.numbers.map((n, i) => (
                <LotteryBall key={`${n}-${i}`} n={n} delay={i * 60} />
              ))}
              {data.bonusNumber !== undefined && (
                <LotteryBall n={data.bonusNumber} bonus delay={data.numbers.length * 60} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => fetchLatest(selectedType)}>
          🔄 Tải lại
        </button>
        <Link href="/history" className="btn btn-secondary">📜 Lịch sử</Link>
        <Link href="/prediction" className="btn btn-secondary">🔮 Thống kê</Link>
        <Link href="/prediction/ai" className="btn">🤖 Dự đoán AI</Link>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type === "success" ? "success" : "error"}`} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}
