import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.DARE_QA_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.DARE_QA_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests/qa",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    // Sign-in helpers use local credentials. Playwright traces serialize fill
    // arguments, so screenshots plus sanitized JSON/HTML results are safer
    // failure artifacts for this authenticated suite.
    trace: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mobile-430", use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
  ],
});
