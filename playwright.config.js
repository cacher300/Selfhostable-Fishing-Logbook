const os = require("node:os");
const path = require("node:path");
const { defineConfig, devices } = require("@playwright/test");

const artifactsRoot = path.resolve(
  process.env.PW_ARTIFACTS_DIR || path.join(os.tmpdir(), "fishing-logbook-playwright"),
);

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  outputDir: path.join(artifactsRoot, "test-results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(artifactsRoot, "report"), open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node scripts/start-test-server.mjs",
    url: "http://127.0.0.1:4173/healthz",
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
