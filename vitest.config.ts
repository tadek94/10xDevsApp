import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// NOTE: We deliberately do NOT use `getViteConfig` from "astro/config" here.
// It loads the full Astro config, which includes the @astrojs/cloudflare
// adapter and its Cloudflare Vite plugin — that plugin aborts Vitest startup
// ("environment options incompatible ... resolve.external"). The code under
// test (generate endpoint + FlashcardGenerator island) needs only the `@/*`
// alias and the React transform, both provided directly below. Astro virtual
// modules (e.g. astro:env/server) are never loaded in tests because @/lib/ai
// is mocked at the seam.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
