import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(here, "specs"),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.KEYFIX_WORKERS ? Number(process.env.KEYFIX_WORKERS) : 2,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:8899/tests/fixtures/host/page.html",
    reuseExistingServer: true,
    cwd: here,
    timeout: 15_000
  }
});
