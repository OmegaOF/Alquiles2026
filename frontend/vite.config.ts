import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/zrender/")) return "chart-renderer";
          if (id.includes("/node_modules/echarts/")) return "echarts";
        },
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  test: {
    include: ["tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    restoreMocks: true,
  },
});
