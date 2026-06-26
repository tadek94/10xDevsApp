import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

// Server-side error monitoring for the Astro SSR worker (Astro 6 + @astrojs/cloudflare v13).
// `wrangler.jsonc` points `main` here, so this wraps the adapter's request handler.
// The DSN comes from the Worker env — `.dev.vars` locally, a Cloudflare secret in
// prod (set by hand). When it's unset, withSentry runs as a no-op, so the app keeps
// working before a Sentry project exists. Minimal scope: error monitoring only
// (no performance tracing), and no default PII.
export default Sentry.withSentry(
  // `env` is the generated Worker `Env`; SENTRY_DSN is a secret from .dev.vars /
  // Cloudflare, which `wrangler types` doesn't include, so read it via a cast.
  (env) => ({
    dsn: (env as Env & { SENTRY_DSN?: string }).SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  handler,
);
