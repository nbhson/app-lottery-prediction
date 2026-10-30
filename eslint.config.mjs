import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 9 flat config — Next 16 đã xóa `next lint`, chạy trực tiếp `eslint .`
 * eslint-config-next 16 export flat config gốc (không cần FlatCompat).
 */
const eslintConfig = [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
