import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],

    // Docker-friendly settings to prevent pool timeouts:
    pool: "forks",
    fileParallelism: false, // ⬅️ This replaces singleFork: true in Vitest v3

    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
