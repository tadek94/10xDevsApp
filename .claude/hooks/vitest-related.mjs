#!/usr/bin/env node
// PostToolUse(Write|Edit) hook — run ONLY the tests related to the edited file,
// and ONLY when that file is in the project's top risk area.
//
// test-plan.md §2 ranks Risk #1 (High × High) as the AI-generation flow: an
// LLM response that is corrupted/empty/error/slow must not break the generate
// path. Its source surface is the endpoint, the AI seam, and the React island
// (covered by tests/pages/api/flashcards/generate.test.ts and
// tests/components/flashcards/FlashcardGenerator.test.tsx).
//
// Edits outside that surface are no-ops (exit 0) so the agent loop stays fast —
// we don't run tests on every helper, config, or unrelated endpoint edit.
import { spawnSync } from "node:child_process";

const raw = await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => resolve(data));
});

let file;
try {
  file = JSON.parse(raw || "{}").tool_input?.file_path;
} catch {
  process.exit(0); // never block on a payload we can't read
}
if (!file) process.exit(0);

// Risk #1 surface — the AI-generation flow. Backslashes normalised for Windows paths.
const rel = file.replace(/\\/g, "/");
const RISK_1 =
  /(^|\/)src\/(pages\/api\/flashcards\/generate\.ts|lib\/ai\.ts|components\/flashcards\/FlashcardGenerator\.tsx)$/;
if (!RISK_1.test(rel)) process.exit(0); // not a risk-area file — skip tests, keep the loop fast

// Vitest 4.1+ honours AI_AGENT=1 for compact, agent-friendly output.
const res = spawnSync(`npx vitest related "${file}" --run`, {
  encoding: "utf8",
  shell: true,
  env: { ...process.env, AI_AGENT: "1" },
});

process.stdout.write(res.stdout || "");
if (res.status !== 0) {
  process.stderr.write((res.stdout || "") + (res.stderr || ""));
  process.stderr.write(`\n[hook] Related tests failed for ${file} — fix them before continuing.\n`);
  process.exit(2);
}
