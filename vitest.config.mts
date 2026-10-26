import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  // 测试只跑纯逻辑，不需要 Tailwind 的 PostCSS
  css: { postcss: {} },
  test: { include: ["tests/**/*.test.ts"] },
});
