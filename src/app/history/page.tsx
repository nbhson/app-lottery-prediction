/**
 * Trang lịch sử kết quả — có phân trang, skeleton loading, bảng chuyên nghiệp
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LotteryType, DrawResult } from "@/types/lottery";
import DrawTable from "@/components/DrawTable";
import Pagination from "@/components/Pagination";
import TypeSelector from "@/components/TypeSelector";

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
    queueMicrotask(() => {
      fetchHistory("MEGA_645");
    });
  }, []);

  return (
    <>
      <h1 style={{ marginBottom: "var(--space-6)" }}>Lịch sử kết quả xổ số</h1>

      <TypeSelector
        selected={selectedType}
        onSelect={(type) => fetchHistory(type, 0)}
      />

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
            <DrawTable draws={draws} />
          </div>

          {/* Phân trang */}
          <Pagination
            page={page}
            limit={LIMIT}
            total={total}
            onPageChange={(p) => fetchHistory(selectedType, p)}
          />
        </>
      ) : (
        <div className="card text-center">
          <p className="text-muted">Chưa có dữ liệu lịch sử.</p>
          <p style={{ marginTop: "var(--space-3)" }}>
            <Link href="/" className="btn">🔄 Về trang chủ để đồng bộ</Link>
          </p>
        </div>
      )}
    </>
  );
}
