import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
