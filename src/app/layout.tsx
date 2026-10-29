import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: {
    default: "Vietlott Prediction — Tra cứu & Thống kê xổ số",
    template: "%s | Vietlott Prediction",
  },
  description:
    "Tra cứu kết quả Vietlott (Mega 6/45, Power 6/55) và xem thống kê tần suất, khoảng trống. Chỉ mang tính tham khảo — không đảm bảo trúng. 18+.",
  keywords: ["Vietlott", "Mega 6/45", "Power 6/55", "xổ số", "thống kê"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c8102e",
};

/**
 * Script chống flash (FOUC) khi load trang: set data-theme trên <html>
 * TRƯỚC khi CSS/body render — ưu tiên localStorage, fallback
 * prefers-color-scheme của hệ điều hành. Chạy inline, đồng bộ, không async.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        {/* Chạy trước mọi nội dung để tránh flash light theme ở dark mode */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <NavBar />
        <main className="main">{children}</main>
        <footer className="footer">
          <p>
            ⚠️ <strong>Cảnh báo:</strong> Ứng dụng chỉ cung cấp thông tin và
            thống kê mang tính tham khảo. Dự đoán KHÔNG đảm bảo trúng — xổ số là
            ngẫu nhiên hoàn toàn, mỗi kỳ quay độc lập. Hãy chơi có trách nhiệm.
            18+
          </p>
        </footer>
      </body>
    </html>
  );
}
