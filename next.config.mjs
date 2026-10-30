/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 là native addon — không bundle, để Node require trực tiếp
  // (Next 15+: serverExternalPackages stable, thay experimental.serverComponentsExternalPackages)
  // Next 16 dùng Turbopack mặc định — alias "@" đọc tự động từ tsconfig paths
  serverExternalPackages: ["better-sqlite3"],

  // Standalone output CHỈ khi build cho Docker (BUILD_STANDALONE=1) —
  // bật luôn sẽ làm `next start` cục bộ không chạy được.
  // Xem Dockerfile: .next/standalone chứa server tối giản tự chạy bằng node.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
