import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Load .env.test into process.env so the spec process can use the service-role
// admin client for user setup/teardown against the dedicated cloud TEST project.
// The app server's OWN secrets come from `.dev.vars` (the @astrojs/cloudflare
// runtime reads that), which `scripts/e2e.sh` points at the test project for the
// run — so always launch E2E via that script (`npm run test:e2e`), never a bare
// `npx playwright test`, or the server would boot against prod.
//
// We run a PRODUCTION build (`astro build` + `astro preview`/wrangler), NOT
// `astro dev`: the dev server's Vite HMR/restart aborts in-flight fetch POSTs
// (net::ERR_ABORTED) and reloads, which is dev-only flakiness unrelated to the
// app. The preview server behaves like prod.
function loadEnvTest(): void {
  let content: string;
  try {
    content = readFileSync(fileURLToPath(new URL("./.env.test", import.meta.url)), "utf8");
  } catch {
    return; // CI injects real env vars instead of a file
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    process.env[key] ??= trimmed.slice(eq + 1).trim();
  }
}
loadEnvTest();

const PORT = 4329; // uncommon port: never reuse a prod-pointing dev server

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // shared cloud test project — serialize to avoid auth rate-limit bursts
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000, // includes a production build
  },
});
