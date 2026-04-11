import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.APP_BASE_URL || "http://127.0.0.1:3101",
    headless: true,
  },
});
