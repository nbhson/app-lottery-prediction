import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 là native addon — không bundle, để Node require trực tiếp
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };
    if (isServer) {
      // Loại bỏ better-sqlite3 khỏi bundle phía server
      config.externals = [...(config.externals || []), "better-sqlite3"];
    }
    return config;
  },
};

export default nextConfig;