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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
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
