// Risk #2 — created cards must persist (reload survival). Write through the real
// POST handler, then read back from the DB via the service-role client and
// assert the persisted values equal what was sent.
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/flashcards/index";
import { authedContext, createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";
import { readFlashcardsByUser } from "../helpers/db";
import { readJson } from "../helpers/http";

interface SaveResponse {
  saved: number;
  cards: { id: string; front: string; back: string; created_at: string }[];
}

describe("POST /api/flashcards — create persistence (Risk #2)", () => {
  let user: TestUser | undefined;

  afterEach(async () => {
    if (user) {
      await deleteTestUser(user.id);
      user = undefined;
    }
  });

  it("persists created cards so a fresh DB read returns the same values", async () => {
    user = await createTestUser();
    const cards = [
      { front: `front-a-${Date.now()}`, back: "back-a" },
      { front: "front-b", back: "back-b" },
    ];

    const context = await authedContext(user, {
      url: "https://test.local/api/flashcards",
      method: "POST",
      body: { cards },
    });
    const res = await POST(context);

    expect(res.status).toBe(200);
    const json = await readJson<SaveResponse>(res);
    expect(json.saved).toBe(2);

    const persisted = await readFlashcardsByUser(user.id);
    expect(persisted).toHaveLength(2);
    expect(persisted.map((c) => c.front).sort()).toEqual(cards.map((c) => c.front).sort());
    expect(persisted.map((c) => c.back).sort()).toEqual(cards.map((c) => c.back).sort());
    for (const card of persisted) {
      expect(card.user_id).toBe(user.id);
    }
  });
});
