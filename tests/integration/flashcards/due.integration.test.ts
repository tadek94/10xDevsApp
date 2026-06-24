// Risk #6 — scheduling is observable through GET /api/flashcards/due. A due card
// is listed; after a "good" grade (due pushed to the future) it drops off; due
// cards come back ordered by srs_due ascending.
import { afterEach, describe, expect, it } from "vitest";
import { POST as createCards } from "@/pages/api/flashcards/index";
import { POST as reviewCard } from "@/pages/api/flashcards/[id]/review";
import { GET as dueCards } from "@/pages/api/flashcards/due";
import { authedContext, createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";
import { setSrsDue } from "../helpers/db";
import { readJson } from "../helpers/http";

interface SaveResponse {
  saved: number;
  cards: { id: string }[];
}
interface DueResponse {
  cards: { id: string; front: string; back: string }[];
}

describe("GET /api/flashcards/due — scheduling is observable (Risk #6)", () => {
  let user: TestUser | undefined;

  afterEach(async () => {
    if (user) {
      await deleteTestUser(user.id);
      user = undefined;
    }
  });

  async function seedCard(u: TestUser, front: string): Promise<string> {
    const ctx = await authedContext(u, {
      url: "https://test.local/api/flashcards",
      method: "POST",
      body: { cards: [{ front, back: "a" }] },
    });
    const json = await readJson<SaveResponse>(await createCards(ctx));
    return json.cards[0].id;
  }

  async function dueIds(u: TestUser): Promise<string[]> {
    const ctx = await authedContext(u, { url: "https://test.local/api/flashcards/due", method: "GET" });
    const res = await dueCards(ctx);
    expect(res.status).toBe(200);
    const json = await readJson<DueResponse>(res);
    return json.cards.map((c) => c.id);
  }

  it("lists a due card, then drops it after a 'good' grade", async () => {
    user = await createTestUser();
    const id = await seedCard(user, "due-q");
    // Force due into the past so due-ness is deterministic (a freshly inserted srs_due uses the
    // DB clock; client/DB skew can otherwise leave it momentarily not-yet-due).
    await setSrsDue(id, new Date(Date.now() - 3600_000).toISOString());

    expect(await dueIds(user)).toContain(id);

    const reviewCtx = await authedContext(user, {
      url: `https://test.local/api/flashcards/${id}/review`,
      method: "POST",
      body: { rating: "good" },
      params: { id },
    });
    expect((await reviewCard(reviewCtx)).status).toBe(200);

    expect(await dueIds(user)).not.toContain(id);
  });

  it("returns due cards ordered by srs_due ascending", async () => {
    user = await createTestUser();
    const earlierId = await seedCard(user, "earlier");
    const laterId = await seedCard(user, "later");
    // Force distinct past due dates so ordering is deterministic.
    await setSrsDue(earlierId, new Date(Date.now() - 2 * 3600_000).toISOString());
    await setSrsDue(laterId, new Date(Date.now() - 1 * 3600_000).toISOString());

    const ordered = (await dueIds(user)).filter((id) => id === earlierId || id === laterId);
    expect(ordered).toHaveLength(2);
    expect(ordered).toEqual([earlierId, laterId]);
  });
});
