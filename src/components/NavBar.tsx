/**
 * NavBar — thanh điều hướng với trạng thái active theo route hiện tại.
 * "use client" vì dùng usePathname + ThemeToggle (client).
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "Kết quả mới nhất" },
  { href: "/history", label: "Lịch sử" },
  { href: "/prediction", label: "Dự đoán" },
  { href: "/prediction/ai", label: "Dự đoán AI" },
  { href: "/stats", label: "Thống kê nâng cao" },
  { href: "/about", label: "Giới thiệu" },
];

export default function NavBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="nav" aria-label="Điều hướng chính">
      <div className="nav-container">
        <Link href="/" className="nav-logo">
          <span aria-hidden="true">🎰</span> Vietlott Prediction
        </Link>
        <nav className="nav-links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "active" : ""}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </nav>
  );
}
