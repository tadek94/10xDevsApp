import * as Sentry from "@sentry/astro";

// Client-side (browser) error monitoring. The DSN is a build-time public value
// read from `import.meta.env.PUBLIC_SENTRY_DSN` (set in `.env` locally / CI build).
// If it's absent we skip init entirely, so we never ship a misconfigured SDK.
// Minimal scope: error monitoring only — no performance tracing, replay, or feedback.
const dsn = import.meta.env.PUBLIC_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
