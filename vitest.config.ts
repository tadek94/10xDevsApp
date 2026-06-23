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
          exclude: [...configDefaults.exclude, "tests/integration/**"],
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
        },
      },
    ],
  },
});
