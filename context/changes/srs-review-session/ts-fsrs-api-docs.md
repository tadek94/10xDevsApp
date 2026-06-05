# ts-fsrs — API docs (for S-03: srs-review-session)

> Source: Context7 MCP, library `/open-spaced-repetition/ts-fsrs` (official repo, High reputation).
> Fetched 2026-06-05. Distilled for S-03 (sesja powtórek SRS, FR-009 / FR-010).
> ts-fsrs implements the FSRS (Free Spaced Repetition Scheduler) algorithm — successor to SM-2.

## Core API

```typescript
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'

const scheduler = fsrs()               // optional config object, see below
const card = createEmptyCard()         // brand-new card with default scheduling state

// Preview all 4 outcomes (use to label the rating buttons with next interval)
const preview = scheduler.repeat(card, new Date())
preview[Rating.Good].card.due          // when card would be due if rated "Good"

// Apply the user's actual answer → returns updated card + review log
const result = scheduler.next(card, new Date(), Rating.Good)
result.card                            // persist this back to the DB
result.log                             // optional review-history record
```

## Enums

```typescript
Rating.Again | Rating.Hard | Rating.Good | Rating.Easy   // the 4 review buttons
State.New | State.Learning | State.Review | State.Relearning
```

## Card shape → drives the Supabase migration

`createEmptyCard()` / `result.card` carries these fields. These are exactly the SRS columns
the roadmap (F-01 §Unknowns) deferred to S-03.

| Field            | Type             | Notes                                         |
|------------------|------------------|-----------------------------------------------|
| `due`            | `Date`           | **ordering key** — fetch cards `where due <= now()` |
| `stability`      | `number`         | FSRS memory state                             |
| `difficulty`     | `number`         | FSRS memory state                             |
| `elapsed_days`   | `number`         |                                               |
| `scheduled_days` | `number`         |                                               |
| `reps`           | `number`         |                                               |
| `lapses`         | `number`         |                                               |
| `state`          | `State` (enum int) |                                             |
| `last_review`    | `Date \| null`   |                                               |

## Persisting state ("zapamiętuje wyniki do następnej sesji")

`Date` objects don't store well — use the `afterHandler` to convert to timestamps on the way out:

```typescript
const saved = scheduler.next(card, new Date(), Rating.Good, ({ card, log }) => ({
  card: {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review?.getTime() ?? null,
  },
  log: { ...log, due: log.due.getTime(), review: log.review.getTime() },
}))
```

To **reconstruct** a Card from DB rows next session, rehydrate the timestamps back into `Date`
and pass the plain object straight into `scheduler.next()` / `repeat()` — it's a structural type,
no constructor needed.

## History helpers

The scheduler provides:
- `rollback(card, log)` — undo a review.
- `forget(card, now, reset_count?)` — reset a card's scheduling state.
- `reschedule(card, reviews, options?)` — replay imported review logs / reconstruct state.

## Direct state calculation (analytics/simulation only)

For simulations or custom pipelines — **not** for the standard review flow (use `repeat()`/`next()` there):

```typescript
import { fsrs, Rating, type FSRSState } from 'ts-fsrs'

const scheduler = fsrs({ enable_fuzz: false })

const memoryState: FSRSState = { stability: 3.2, difficulty: 5.6 }
const elapsedDays = 12
const nextState = scheduler.next_state(memoryState, elapsedDays, Rating.Good)
const nextInterval = scheduler.next_interval(nextState.stability, elapsedDays)
```

## Config notes (`fsrs({...})`)

- `enable_fuzz` — adds randomness to intervals to avoid review pile-ups; fine to leave default.
- `next_state()` / `next_interval()` — analytics/simulation only.

## Session loop for S-03

1. Query the user's flashcards `WHERE due <= now()` ordered by `due` (this *is* the SRS ordering — no separate sort algorithm needed).
2. For each card: show front → reveal back → user picks Again/Hard/Good/Easy.
3. Call `scheduler.next(card, new Date(), rating)`, write the returned card fields back to that row.
4. Session ends when no cards remain due.

## Open considerations (for `/10x-plan srs-review-session`)

1. **Library choice still open** (roadmap Question #2): `ts-fsrs` vs. hand-rolled 1d→3d→7d schedule.
   ts-fsrs adds ~9 SRS columns + the FSRS memory model; the simple schedule needs ~3 columns. Plan-phase decision.
2. **workerd compatibility** — ts-fsrs is pure-TS ESM with no native deps, so it should run in the
   Cloudflare runtime, but confirm no bundler friction before committing (per F-02 / lessons.md).
