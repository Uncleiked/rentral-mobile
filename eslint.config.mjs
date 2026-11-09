import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-verify/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "apps/mobile/.expo/**",
    "apps/mobile/dist/**",
    "next-env.d.ts",
    "**/.expo/**",
    "apps/mobile/dist/**",
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
    ".npm-migration-backup/**",
  ]),
]);

export default eslintConfig;
