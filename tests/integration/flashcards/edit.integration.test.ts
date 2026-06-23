// Risk #2 — edits must persist (the prd.md:52 guardrail: no silent data loss).
// Seed a card, PATCH it through the real handler, then read back from the DB and
// assert the new values survived. Also covers the RLS ownership-miss → 404.
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/flashcards/index";
import { PATCH } from "@/pages/api/flashcards/[id]";
import { authedContext, createTestUser, deleteTestUser, type TestUser } from "../helpers/auth";
import { readFlashcard } from "../helpers/db";
import { readJson } from "../helpers/http";

interface SaveResponse {
  saved: number;
  cards: { id: string; front: string; back: string; created_at: string }[];
}
interface CardResponse {
  card: { id: string; front: string; back: string; created_at: string };
}

describe("PATCH /api/flashcards/[id] — edit persistence (Risk #2)", () => {
  let user: TestUser | undefined;

  afterEach(async () => {
    if (user) {
      await deleteTestUser(user.id);
      user = undefined;
    }
  });

  async function seedCard(u: TestUser, front: string, back: string): Promise<string> {
    const ctx = await authedContext(u, {
      url: "https://test.local/api/flashcards",
      method: "POST",
      body: { cards: [{ front, back }] },
    });
    const res = await POST(ctx);
    expect(res.status).toBe(200);
    const json = await readJson<SaveResponse>(res);
    return json.cards[0].id;
  }

  it("persists an edit so a fresh DB read returns the new values", async () => {
    user = await createTestUser();
    const id = await seedCard(user, "original front", "original back");

    const ctx = await authedContext(user, {
      url: `https://test.local/api/flashcards/${id}`,
      method: "PATCH",
      body: { front: "edited front", back: "edited back" },
      params: { id },
    });
    const res = await PATCH(ctx);

    expect(res.status).toBe(200);
    const json = await readJson<CardResponse>(res);
    expect(json.card.front).toBe("edited front");

    const persisted = await readFlashcard(id);
    if (!persisted) {
      throw new Error("card not found after edit");
    }
    expect(persisted.front).toBe("edited front");
    expect(persisted.back).toBe("edited back");
    expect(new Date(persisted.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(persisted.created_at).getTime());
  });

  it("returns 404 when editing a card the user does not own (RLS)", async () => {
    user = await createTestUser();
    const otherId = crypto.randomUUID();

    const ctx = await authedContext(user, {
      url: `https://test.local/api/flashcards/${otherId}`,
      method: "PATCH",
      body: { front: "x", back: "y" },
      params: { id: otherId },
    });
    const res = await PATCH(ctx);

    expect(res.status).toBe(404);
  });
});
