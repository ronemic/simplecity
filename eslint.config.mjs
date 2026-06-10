import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "out/**",
      "playwright-report/**",
      "scraped-primegov/**",
      "supabase/functions/**",
      "test-results/**",
      "next-env.d.ts",
      "*.tsbuildinfo"
    ]
  }
];

export default eslintConfig;
