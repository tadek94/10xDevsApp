# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Cloudflare Workers Deploy: Run from Root, Not from dist/server/

- **Context**: Deploying Astro SSR with `@astrojs/cloudflare` adapter v13+.
- **Problem**: Running `wrangler deploy` from `dist/server/` causes a config conflict error ("Found both a user configuration file and a deploy configuration file that do not share the same base path"). The adapter generates `.wrangler/deploy/config.json` at the project root, and wrangler must be run from there.
- **Rule**: Always run `npx wrangler deploy` from the **project root**. Wrangler reads `.wrangler/deploy/config.json` which redirects to `dist/server/wrangler.json` automatically.
- **Corollary**: If the adapter adds bindings (SESSION KV, IMAGES) that don't exist in Cloudflare yet, the first deploy will fail with "already exists" or "not found" errors. Pre-create or pin the resources in `wrangler.jsonc` before the second deploy.
- **Corollary**: `imageService: "passthrough"` should be set in the adapter config when Cloudflare Images is not needed — otherwise the adapter adds an IMAGES binding that requires a paid Cloudflare Images subscription.
- **Applies to**: deploy

## Supabase Migrations: Always Include Explicit GRANTs

- **Context**: Tworzenie nowych tabel przez migracje Supabase (`supabase/migrations/`).
- **Problem**: Nowe projekty Supabase nie mają automatycznych default privileges. Migracja F-01 (`flashcards`) nie zawierała GRANT — INSERT kończył się `permission denied for table` nawet dla zalogowanych użytkowników z prawidłową polityką RLS.
- **Rule**: Każda migracja tworząca nową tabelę musi zawierać jawny GRANT: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<table> TO authenticated;`. RLS policies bez GRANT nie wystarczają.
- **Applies to**: plan, implement, impl-review

## Always Set a Kill Date on Feature Flags

- **Context**: Planning & implementation phases — any point where a feature flag is introduced.
- **Problem**: Flags accumulate and are never cleaned up; dead flags litter the codebase and block future refactors.
- **Rule**: Feature flags should always have a kill date. Record the date (or milestone) at the time the flag is introduced — not as an afterthought.
- **Applies to**: plan, implement, impl-review

## Endpointy API z RLS: Zhydratyzuj sesję przez getSession() przed zapytaniami

- **Context**: Każdy endpoint API (src/pages/api/) tworzący nowego klienta Supabase i wykonujący zapytania do tabel z politykami RLS opartymi na auth.uid().
- **Problem**: Świeży klient z createClient() nie ma zhydratyzowanej sesji. Bez wczytania sesji zapytanie leci z anon key, auth.uid()=null i polityka WITH CHECK odrzuca każdy wiersz (F8). Osobny problem od brakującego GRANT — oba muszą być spełnione.
- **Rule**: Przed zapytaniami do tabel RLS w endpoincie wywołaj `await supabase.auth.getSession()` aby zhydratyzować JWT. Używaj getSession() (lokalny odczyt cookie, bez round-tripu), nie getUser() — tożsamość waliduje middleware.
- **Applies to**: plan, implement, impl-review

## Endpointy mutujące pod optymistyczny UI: zwracaj pełny rekord, nie samo id

- **Context**: Endpointy API mutujące wiersz (POST/PATCH) w `src/pages/api/`, których wynik konsumuje React-island aktualizujący stan lokalnie (np. `flashcards/[id].ts` PATCH, `flashcards/index.ts` POST).
- **Problem**: Plan kontraktował zwrot `{id}` / `.select("id")`, ale wyspa potrzebuje pełnej karty (`front, back, created_at`), by zsynchronizować stan bez dodatkowego round-tripu. Implementacja musiała odejść od litery planu (zwraca `{card}` / `{cards}`). Rozjazd plan↔UI wychodzi dopiero przy budowie frontu.
- **Rule**: Gdy endpoint mutujący feeduje optymistyczny UI, projektuj kontrakt tak, by zwracał pełny zmieniony rekord (`.select` z kompletem pól), a plan ma to jawnie określać — nie domyślne `{id}`.
- **Applies to**: plan, implement, impl-review

## Po zmianie `env.schema` uruchom `astro sync` przed `lint`

- **Context**: Dodanie/zmiana zmiennej w `env.schema` w `astro.config.mjs` (np. `SUPABASE_SERVICE_ROLE_KEY`), importowanej przez `astro:env/server`.
- **Problem**: `npm run lint` (typed rules) zgłaszał `@typescript-eslint/no-unsafe-argument` na `supabase.ts` — nie z winy kodu, tylko dlatego, że wygenerowane typy `astro:env/server` w `.astro/` były nieświeże i nowy import rozwiązywał się do `any`. Fałszywy alarm znikał dopiero po regeneracji typów.
- **Rule**: Po każdej zmianie `env.schema` (i ogólnie typów generowanych przez Astro) odpal `npx astro sync` (albo pełny `npm run build`) **przed** `npm run lint`. Inaczej lint może raportować fantomowe błędy typowania na nietkniętym kodzie.
- **Applies to**: implement, impl-review

## E2E on the Cloudflare adapter: test-env isolation + dev-server fetch aborts

- **Context**: Standing up Playwright E2E for this Astro SSR + `@astrojs/cloudflare` app (`scripts/e2e.sh`, `tests/e2e/`). Auth is Supabase cookie-based; DB writes go through API routes.
- **Problem**: Three separate frictions blocked a green browser test even though the app is provably correct (manual-add POST → 200, row persisted in the DB, and the reloaded SSR `/flashcards` HTML *contains* the card): (1) `astro dev` loads secrets from **`.dev.vars`** and ignores `.env` / `.env.test` / `--mode`, so a naive run silently hits **prod**; (2) `astro dev`'s **Vite HMR/restart aborts in-flight `fetch` POSTs** (`net::ERR_ABORTED`) and browser reloads — dev-only flakiness, not an app bug (native form-POST sign-in was unaffected); (3) `astro preview` (the built worker via wrangler) does **not** pick up a swapped root `.dev.vars` the same way dev does, so it boots against the wrong project and sign-in fails.
- **Rule**: For E2E here: (a) point the server at the dedicated cloud **TEST** project via the secret source the runtime actually reads (`.dev.vars`), with a guaranteed restore — never let E2E touch prod; (b) verify *which* project the server uses with a sign-in smoke before trusting results; (c) run against a **production build/preview**, not `astro dev` (HMR aborts fetches) — but note the preview still needs correct test-secret wiring (a wrangler test-env config or a verified `.dev.vars` path), which is the remaining follow-up. Cross-boundary persistence itself is already covered by the integration tests (`tests/integration/`); E2E's unique value is the full UI→SSR path. The blocked spec is committed as `test.fixme` in `tests/e2e/seed.spec.ts`.
- **Applies to**: e2e, implement
