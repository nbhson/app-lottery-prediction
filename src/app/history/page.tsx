/**
 * Trang lịch sử kết quả — có phân trang, skeleton loading, bảng chuyên nghiệp
 */
"use client";

import { useState, useEffect } from "react";
import { LOTTERY_RULES, LotteryType, DrawResult } from "@/types/lottery";
import LotteryBall from "@/components/LotteryBall";
import { formatDate, formatVnd } from "@/lib/format";

const LIMIT = 10;

export default function HistoryPage() {
  const [selectedType, setSelectedType] = useState<LotteryType>("MEGA_645");
  const [draws, setDraws] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const fetchHistory = async (type: LotteryType, pageNum: number = 0) => {
    setSelectedType(type);
    setPage(pageNum);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/draws/history?type=${type}&limit=${LIMIT}&offset=${pageNum * LIMIT}`
      );
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setDraws(json.data);
        setTotal(json.meta.total);
      }
    } catch {
      setError("Lỗi kết nối server. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Load mặc định khi mount
  useEffect(() => {
    fetchHistory("MEGA_645");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <h1 style={{ marginBottom: "var(--space-6)" }}>Lịch sử kết quả xổ số</h1>

      <div className="type-selector" role="tablist" aria-label="Loại hình xổ số">
        {Object.entries(LOTTERY_RULES).map(([key, rule]) => (
          <button
            key={key}
            role="tab"
            aria-selected={selectedType === key}
            className={`type-btn${selectedType === key ? " active" : ""}`}
            onClick={() => fetchHistory(key as LotteryType, 0)}
          >
            {rule.nameVi}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" aria-busy="true" aria-label="Đang tải lịch sử">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
              <div className="skeleton skeleton-text" style={{ width: "110px" }} />
              <div className="skeleton skeleton-text" style={{ width: "90px" }} />
              <div className="skeleton skeleton-text" style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card">
          <p className="error-text" role="alert">{error}</p>
          <div className="text-center">
            <button className="btn" onClick={() => fetchHistory(selectedType, page)}>
              🔄 Thử lại
            </button>
          </div>
        </div>
      ) : draws.length > 0 ? (
        <>
          <div className="card">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Kỳ</th>
                    <th scope="col">Ngày</th>
                    <th scope="col">Kết quả</th>
                    <th scope="col">Jackpot</th>
                  </tr>
                </thead>
                <tbody>
                  {draws.map((draw) => (
                    <tr key={draw.id}>
                      <td className="mono">{draw.drawNumber}</td>
                      <td>{formatDate(draw.drawDate)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
                          {draw.numbers.map((n, i) => (
                            <LotteryBall key={`${draw.id}-${n}-${i}`} n={n} size="sm" />
                          ))}
                          {draw.bonusNumber !== undefined && (
                            <LotteryBall n={draw.bonusNumber} bonus size="sm" />
                          )}
                        </div>
                      </td>
                      <td>
                        {draw.jackpot > 0 ? (
                          <span className="badge badge-success">{formatVnd(draw.jackpot)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phân trang */}
          <nav
            aria-label="Phân trang"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-2)",
            }}
          >
            <span className="text-muted">
              Hiển thị {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} của {total} kỳ
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchHistory(selectedType, page - 1)}
                disabled={page === 0}
              >
                ← Trước
              </button>
              <span className="badge badge-neutral">
                Trang {page + 1}/{totalPages || 1}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchHistory(selectedType, page + 1)}
                disabled={page >= totalPages - 1}
              >
                Sau →
              </button>
            </div>
          </nav>
        </>
      ) : (
        <div className="card text-center">
          <p className="text-muted">Chưa có dữ liệu lịch sử.</p>
          <p style={{ marginTop: "var(--space-3)" }}>
            <a href="/" className="btn">🔄 Về trang chủ để đồng bộ</a>
          </p>
        </div>
      )}
    </>
  );
}
