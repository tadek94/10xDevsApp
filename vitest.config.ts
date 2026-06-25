import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// NOTE: We deliberately do NOT use `getViteConfig` from "astro/config" — it
// loads the @astrojs/cloudflare adapter whose Vite plugin aborts Vitest startup.
// The `@/*` alias and React transform are supplied directly below.
//
// Two projects:
// - "unit"        — jsdom, offline, no real env. The default `npm test`.
// - "integration" — node, hits the cloud test project. Resolves `astro:env/server`
//   to a shim reading process.env (loaded from .env.test) so the real
//   src/lib/supabase.ts runs unchanged. Run via `npm run test:integration`.
const srcAlias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
const astroEnvShim = fileURLToPath(new URL("./tests/shims/astro-env-server.ts", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: srcAlias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/**/*.{test,spec}.{ts,tsx}"],
          // Playwright specs (tests/e2e/**) use @playwright/test's runner, not Vitest —
          // importing them here throws "test.describe() was not expected to be called".
          exclude: [...configDefaults.exclude, "tests/integration/**", "tests/e2e/**"],
        },
      },
      {
        resolve: { alias: { ...srcAlias, "astro:env/server": astroEnvShim } },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./tests/integration/setup.ts"],
          include: ["tests/integration/**/*.{test,spec}.ts"],
          // Real cloud round-trips (createUser → sign-in → handler → read-back) need more
          // than the 5s default; run files sequentially so the shared test project isn't hit
          // by parallel auth bursts (GoTrue rate limits).
          testTimeout: 30000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
