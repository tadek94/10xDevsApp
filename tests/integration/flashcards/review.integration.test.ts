// Risk #6 — a grade must persist and schedule. Drive the real review handler,
// then read the SRS columns back from the DB and assert the OBSERVABLE oracle
// (future due, reps advanced, last_review set, "again" sooner than "good").
// Never assert ts-fsrs internal numbers (test-plan.md:63, §7).
import { afterEach, describe, expect, it } from "vitest";
import { POST as createCards } from "@/pages/api/flashcards/index";
import { POST as reviewCard } from "@/pages/api/flashcards/[id]/review";
import { authedContext, createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";
import { readFlashcard } from "../helpers/db";
import { readJson } from "../helpers/http";

interface SaveResponse {
  saved: number;
  cards: { id: string }[];
}

// A freshly created card defaults to srs_due = now() and srs_reps = 0 → immediately due.
async function seedDueCard(user: TestUser, front = "q", back = "a"): Promise<string> {
  const ctx = await authedContext(user, {
    url: "https://test.local/api/flashcards",
    method: "POST",
    body: { cards: [{ front, back }] },
  });
  const res = await createCards(ctx);
  expect(res.status).toBe(200);
  const json = await readJson<SaveResponse>(res);
  return json.cards[0].id;
}

async function grade(user: TestUser, id: string, rating: string): Promise<Response> {
  const ctx = await authedContext(user, {
    url: `https://test.local/api/flashcards/${id}/review`,
    method: "POST",
    body: { rating },
    params: { id },
  });
  return reviewCard(ctx);
}

describe("POST /api/flashcards/[id]/review — grade persistence & scheduling (Risk #6)", () => {
  let user: TestUser | undefined;

  afterEach(async () => {
    if (user) {
      await deleteTestUser(user.id);
      user = undefined;
    }
  });

  it("persists the new schedule: future due, reps advanced, last_review set", async () => {
    user = await createTestUser();
    const id = await seedDueCard(user);
    const before = Date.now();

    const res = await grade(user, id, "good");
    expect(res.status).toBe(200);

    const card = await readFlashcard(id);
    if (!card) {
      throw new Error("card missing after review");
    }
    expect(card.srs_reps).toBe(1);
    expect(new Date(card.srs_due).getTime()).toBeGreaterThan(before);
    expect(card.srs_last_review).not.toBeNull();
    expect(card.srs_state).toBeGreaterThanOrEqual(0);
    expect(card.srs_state).toBeLessThanOrEqual(3);
    // srs_elapsed_days is deprecated in ts-fsrs and not part of the round-trip → stays at default.
    expect(card.srs_elapsed_days).toBe(0);
  });

  it("schedules 'again' sooner than 'good'", async () => {
    user = await createTestUser();
    const againId = await seedDueCard(user, "again-q", "a");
    const goodId = await seedDueCard(user, "good-q", "a");

    expect((await grade(user, againId, "again")).status).toBe(200);
    expect((await grade(user, goodId, "good")).status).toBe(200);

    const again = await readFlashcard(againId);
    const good = await readFlashcard(goodId);
    if (!again || !good) {
      throw new Error("cards missing after review");
    }
    expect(new Date(again.srs_due).getTime()).toBeLessThan(new Date(good.srs_due).getTime());
  });

  it("rejects an unknown rating with 400", async () => {
    user = await createTestUser();
    const id = await seedDueCard(user);
    const res = await grade(user, id, "perfect");
    expect(res.status).toBe(400);
  });

  it("returns 404 when grading a card the user does not own (RLS)", async () => {
    user = await createTestUser();
    const res = await grade(user, crypto.randomUUID(), "good");
    expect(res.status).toBe(404);
  });
});
