/**
 * ThemeToggle — nút chuyển dark/light mode (client).
 *
 * - Lưu lựa chọn vào localStorage("theme")
 * - Lần đầu vào trang: script chống flash trong layout.tsx đã set
 *   data-theme theo localStorage hoặc prefers-color-scheme trước khi hydrate,
 *   component chỉ đọc lại trạng thái hiện có → không mismatch, không nháy.
 */
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage có thể bị chặn (private mode) — bỏ qua
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      title={isDark ? "Giao diện sáng" : "Giao diện tối"}
    >
      <span aria-hidden="true">{theme === null ? "◐" : isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}
