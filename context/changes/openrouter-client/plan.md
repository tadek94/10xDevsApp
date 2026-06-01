# OpenRouter Client — Implementation Plan

## Overview

Configure the AI foundation for 10xCards: install the `openai` SDK, create `src/lib/ai.ts` with a client pointed at OpenRouter, and update env templates. This is F-02 from the roadmap — the AI layer that unlocks S-01 (flashcard generation). A workerd smoke test in Phase 2 catches CJS/import incompatibilities before S-01 builds on this foundation.

## Current State Analysis

- `OPENROUTER_API_KEY` is already declared in `astro.config.mjs` env schema (line 18) as `optional: true, context: "server", access: "secret"` — no schema change needed.
- `wrangler.jsonc` has `"nodejs_compat"` flag — required for npm packages in Cloudflare Workers.
- `src/lib/supabase.ts` establishes the pattern: import env vars from `astro:env/server`, return `null`/fallback when missing.
- No AI SDK in `package.json` — `openai` package needs to be installed.
- `src/lib/ai.ts` does not exist.
- `.dev.vars.example` does not exist; `.env.example` has only the two Supabase vars.

## Desired End State

`src/lib/ai.ts` exports a configured `OpenAI` client (pointed at `https://openrouter.ai/api/v1`) and a `DEFAULT_MODEL` constant. Both env template files include `OPENROUTER_API_KEY`. A real API call succeeds in the workerd dev runtime, confirming no CJS/import issues before S-01 starts.

### Key Discoveries

- `astro.config.mjs:18` — `OPENROUTER_API_KEY` env schema already present; skip schema edits.
- `src/lib/supabase.ts` — follow its `import from "astro:env/server"` + `?? ""` null-safety pattern.
- `wrangler.jsonc` — `nodejs_compat` is set; openai SDK (fetch-based, ESM-first) should be compatible.

## What We're NOT Doing

- Streaming responses — deferred to S-01 where the prompt and UX are defined.
- Model selection logic / fallbacks — single `DEFAULT_MODEL` constant is enough for F-02.
- A permanent `/api/ai-test` route — the smoke test route is temporary and deleted after Phase 2.
- Prompt engineering — belongs entirely in S-01.

## Phase 1: AI Module + Env Files

### Overview

Install the `openai` package, create `src/lib/ai.ts`, and update both env template files. `npm run lint` + `npm run build` confirm the module compiles cleanly for the Cloudflare target.

### Changes Required

#### 1. Install openai SDK

**File:** `package.json` (via npm install)

**Intent:** Add the `openai` npm package as a runtime dependency. OpenRouter is OpenAI API–compatible; setting `baseURL` is the only required config change.

**Contract:** Run `npm install openai`. Adds `"openai": "^4.x"` to `dependencies`.

#### 2. Create AI client module

**File:** `src/lib/ai.ts`

**Intent:** Export a pre-configured `OpenAI` instance pointed at OpenRouter and a `DEFAULT_MODEL` constant. All AI routes in the project import from here — never construct the client inline.

**Contract:** Exports two named symbols: `ai` (OpenAI instance) and `DEFAULT_MODEL` (string). Follows the null-safety pattern from `src/lib/supabase.ts` — use `?? ""` for the API key so the module doesn't throw when the env var is absent.

```ts
import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "astro:env/server";

export const DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free";

export const ai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY ?? "",
});
```

#### 3. Update `.env.example`

**File:** `.env.example`

**Intent:** Add `OPENROUTER_API_KEY=###` so the template documents all three required server secrets.

**Contract:** Append one line — `OPENROUTER_API_KEY=###` — after the existing Supabase entries.

#### 4. Create `.dev.vars.example`

**File:** `.dev.vars.example` (new file)

**Intent:** Cloudflare local dev reads `.dev.vars`, not `.env`. A committed example file tells developers (and agents) which vars to copy.

**Contract:** Three lines mirroring `.env.example`:
```
SUPABASE_URL=###
SUPABASE_KEY=###
OPENROUTER_API_KEY=###
```

### Success Criteria

#### Automated Verification

- `npm install openai` exits 0, `openai` appears in `package.json` dependencies
- `npm run lint` passes with no errors
- `npm run build` passes — confirms the module compiles for Cloudflare target without bundler errors

#### Manual Verification

- `src/lib/ai.ts` imports cleanly in editor (no TypeScript errors in IDE)
- Both env example files contain `OPENROUTER_API_KEY=###`

**Implementation Note:** After all automated checks pass, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Workerd Smoke Test

### Overview

Verify the `openai` SDK actually works in the Cloudflare workerd runtime by creating a minimal temporary API route, making a real call, then deleting the route. This is the early incompatibility check the roadmap requires before S-01 builds on this client.

### Changes Required

#### 1. Create temporary smoke test route

**File:** `src/pages/api/ai-test.ts` (temporary — deleted after test)

**Intent:** Expose a GET endpoint that calls `ai.chat.completions.create()` with a trivial prompt. If the openai SDK has CJS or crypto issues in workerd, they surface here before S-01 code is written.

**Contract:**

```ts
import type { APIRoute } from "astro";
import { ai, DEFAULT_MODEL } from "@/lib/ai";

export const prerender = false;

export const GET: APIRoute = async () => {
  const completion = await ai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
    max_tokens: 5,
  });
  return new Response(
    JSON.stringify({ result: completion.choices[0].message.content }),
    { headers: { "Content-Type": "application/json" } }
  );
};
```

#### 2. Delete smoke test route

**File:** `src/pages/api/ai-test.ts` (delete)

**Intent:** The route is scaffolding only — remove it after the test passes so it doesn't ship to production.

### Success Criteria

#### Automated Verification

- `npm run dev` starts without import or runtime errors in the console

#### Manual Verification

- `GET /api/ai-test` returns `{ "result": "OK" }` (or similar single-word response)
- No `CJS`, `crypto`, or `Cannot find module` errors in the dev console
- After confirming the call works, `src/pages/api/ai-test.ts` is deleted and `npm run build` still passes

**Implementation Note:** Requires `OPENROUTER_API_KEY` set in your local `.dev.vars`. After the smoke test passes and the route is deleted, commit both phases together.

---

## Testing Strategy

### Manual Testing Steps

1. `npm run dev` — confirm app starts, dashboard loads, no console errors
2. `GET http://localhost:4321/api/ai-test` — confirm JSON response with a short text
3. Delete `src/pages/api/ai-test.ts`, run `npm run build` — confirm clean build

## References

- Roadmap item: `context/foundation/roadmap.md` § F-02
- Pattern reference: `src/lib/supabase.ts` (env import + null-safety)
- OpenRouter API docs: https://openrouter.ai/docs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: AI Module + Env Files

#### Automated

- [x] 1.1 `npm install openai` exits 0, package in dependencies — 0619022
- [x] 1.2 `npm run lint` passes with no errors — 0619022
- [x] 1.3 `npm run build` passes for Cloudflare target — 0619022

#### Manual

- [x] 1.4 `src/lib/ai.ts` has no TypeScript errors in IDE — 0619022
- [x] 1.5 Both `.env.example` and `.dev.vars.example` contain `OPENROUTER_API_KEY=###` — 0619022

### Phase 2: Workerd Smoke Test

#### Automated

- [x] 2.1 `npm run dev` starts without import or runtime errors — b075dd0

#### Manual

- [x] 2.2 `GET /api/ai-test` returns `{ "result": "OK" }` (or equivalent) — b075dd0
- [x] 2.3 No CJS/crypto errors in dev console — b075dd0
- [x] 2.4 Smoke test route deleted, `npm run build` still passes — b075dd0
