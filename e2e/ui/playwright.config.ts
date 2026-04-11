import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../generated",
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.QA_RUNNER_BASE_URL || process.env.APP_BASE_URL || "http://127.0.0.1:4545",
    headless: true,
    trace: "on",
    video: "on",
  },
});
