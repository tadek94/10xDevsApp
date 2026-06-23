// Connectivity smoke test: proves the integration project resolves the test
// project's config (via the astro:env/server shim + .env.test) and can reach it.
import { afterAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser } from "./helpers/auth";

describe("integration harness", () => {
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) {
      await deleteTestUser(userId);
    }
  });

  it("creates and tears down a test user against the cloud test project", async () => {
    const user = await createTestUser();
    userId = user.id;
    expect(user.id).toBeTruthy();
    expect(user.email).toContain("@example.com");
  });
});
