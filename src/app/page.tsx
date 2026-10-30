/**
 * Trang chủ — Kết quả Vietlott thật từ vietlott.vn
 *
 * Server Component: fetch trực tiếp từ SQLite lúc render (force-dynamic)
 * → kết quả hiển thị ngay trong HTML đầu tiên, không còn "flash skeleton".
 * Phần tương tác (chọn loại hình, nút đồng bộ, toast) nằm ở HomeClient.
 */
import { getLatestDraw, getDataSourceStatus } from "@/lib/db";
import HomeClient from "@/components/HomeClient";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const initialData = getLatestDraw("MEGA_645");
  const initialStatus = getDataSourceStatus();

  return (
    <HomeClient
      initialData={initialData}
      initialStatus={initialStatus}
    />
  );
}
