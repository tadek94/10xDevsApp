#!/usr/bin/env bash
# Run Playwright E2E against the cloud TEST Supabase project.
#
# Why this wrapper exists: the @astrojs/cloudflare dev runtime loads secrets from
# `.dev.vars` (it logs "Using secrets defined in .dev.vars") and ignores `.env`
# / `.env.test` / `--mode`. Our committed `.dev.vars` points at PROD. So for the
# E2E run we temporarily rewrite `.dev.vars` with the TEST project's keys (from
# `.env.test`) and ALWAYS restore the original on exit — success, failure, or
# Ctrl-C — via the EXIT trap. This guarantees prod creds are never left swapped
# and that E2E never touches prod.
set -euo pipefail
cd "$(dirname "$0")/.."

DEVVARS=".dev.vars"
BACKUP=".dev.vars.e2e-backup"

restore() {
  if [ -f "$BACKUP" ]; then
    mv -f "$BACKUP" "$DEVVARS"
    echo "[e2e] restored original $DEVVARS"
  fi
}
trap restore EXIT

if [ ! -f .env.test ]; then
  echo "[e2e] .env.test not found — fill it from .env.test.example first." >&2
  exit 1
fi

[ -f "$DEVVARS" ] && cp "$DEVVARS" "$BACKUP"

# Point the dev runtime at the TEST project for the duration of this run.
grep -E '^(SUPABASE_URL|SUPABASE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' .env.test > "$DEVVARS"
echo "[e2e] .dev.vars temporarily points at the test project"

npx playwright test "$@"
