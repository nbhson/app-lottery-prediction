/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 là native addon — không bundle, để Node require trực tiếp
  // (Next 15+: serverExternalPackages stable, thay experimental.serverComponentsExternalPackages)
  // Next 16 dùng Turbopack mặc định — alias "@" đọc tự động từ tsconfig paths
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
