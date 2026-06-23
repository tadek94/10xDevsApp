// Integration-project setup: load `.env.test` into process.env before any test
// module (and therefore before the astro:env/server shim is evaluated), then
// fail fast with a clear message if required keys are missing. Dep-free — no
// dotenv. Real environment variables win over the file so CI can inject secrets.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function loadEnvTest(): void {
  const path = fileURLToPath(new URL("../../.env.test", import.meta.url));
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    // No .env.test file (e.g. CI injects via real env vars) — rely on process.env.
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue; // real env wins (CI)
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

loadEnvTest();

for (const key of REQUIRED) {
  if (!process.env[key]) {
    throw new Error(
      `Integration tests require ${key}. Fill .env.test (see .env.test.example) or set it in the environment.`,
    );
  }
}
