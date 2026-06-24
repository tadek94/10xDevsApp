// Connectivity smoke test: proves the integration project resolves the test
// project's config (via the astro:env/server shim + .env.test) and can reach it.
// Also guards the teardown contract: deleting a user must CASCADE its flashcards
// away — if a future migration drops ON DELETE CASCADE, this test fails instead
// of silently leaking rows into the shared test project.
import { afterAll, describe, expect, it } from "vitest";
import { POST as createCards } from "@/pages/api/flashcards/index";
import { authedContext, createTestUser, deleteTestUser } from "./helpers/auth";
import { readFlashcard } from "./helpers/db";
import { readJson } from "./helpers/http";

interface SaveResponse {
  saved: number;
  cards: { id: string }[];
}

describe("integration harness", () => {
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) {
      await deleteTestUser(userId);
    }
  });

  it("creates a user + card, then deleteTestUser cascades the card away", async () => {
    const user = await createTestUser();
    userId = user.id;
    expect(user.id).toBeTruthy();
    expect(user.email).toContain("@example.com");

    const ctx = await authedContext(user, {
      url: "https://test.local/api/flashcards",
      method: "POST",
      body: { cards: [{ front: "smoke-q", back: "smoke-a" }] },
    });
    const res = await createCards(ctx);
    expect(res.status).toBe(200);
    const json = await readJson<SaveResponse>(res);
    const cardId = json.cards[0].id;
    expect(await readFlashcard(cardId)).not.toBeNull();

    // Deleting the user must cascade-remove the card (FK ON DELETE CASCADE).
    await deleteTestUser(user.id);
    userId = undefined; // already deleted — skip afterAll
    expect(await readFlashcard(cardId)).toBeNull();
  });
});
