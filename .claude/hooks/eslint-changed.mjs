#!/usr/bin/env node
// PostToolUse(Write|Edit) hook — lint the single file the agent just touched.
//
// Reads the tool payload from stdin, runs `eslint --fix` on the edited file,
// and on problems that auto-fix can't resolve exits 2 so the report flows
// back to the agent as context (Claude Code feeds hook stderr to the model
// on exit code 2). Non-source files and parse misses are no-ops (exit 0).
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
  process.exit(0); // not our concern — never block on a payload we can't read
}

if (!file || !/\.(ts|tsx|astro)$/.test(file)) process.exit(0);

const res = spawnSync(`npx eslint --fix "${file}"`, { encoding: "utf8", shell: true });

if (res.status !== 0) {
  process.stderr.write((res.stdout || "") + (res.stderr || ""));
  process.stderr.write(`\n[hook] ESLint problems remain in ${file} — fix the issues above.\n`);
  process.exit(2);
}
