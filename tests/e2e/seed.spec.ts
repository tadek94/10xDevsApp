// E2E seed exemplar + standalone risk test.
//
// Risk (context/foundation/test-plan.md #2, UI layer): a card the user adds must
// survive a real SSR page reload — no silent data loss across auth → routing →
// API → DB → SSR. This file is also the project's seed: new E2E tests copy its
// patterns (role-based locators, real auth, unique data, wait-for-state, cleanup,
// risk-named test). See tests/e2e/RULES.md.
//
// Runs against a PRODUCTION build via scripts/e2e.sh (astro build + preview) —
// not `astro dev`, whose Vite HMR/restart aborts in-flight fetches and reloads.
import { expect, test } from "@playwright/test";
import { createE2EUser, deleteE2EUser, type E2EUser } from "./helpers/supabase";

test.describe("flashcard persistence across reload (Risk #2, UI layer)", () => {
  let user: E2EUser | undefined;

  test.beforeAll(async () => {
    // Data setup only — created via the service-role admin API, not the UI.
    user = await createE2EUser();
  });

  test.afterAll(async () => {
    if (user) {
      await deleteE2EUser(user.id); // cascade removes the card
      user = undefined;
    }
  });

  // BLOCKED (not a failure): the app is verified correct end-to-end (card persists
  // to the DB and the SSR /flashcards HTML contains it). The green run is gated on
  // test-env wiring for the Cloudflare runtime — `astro preview` (built worker)
  // doesn't pick up the swapped .dev.vars, so sign-in can't reach the test project.
  // See context/foundation/lessons.md ("E2E against the Cloudflare adapter").
  // Flip `test.fixme` → `test` once the preview reads the test project's secrets.
  test.fixme("a manually added card survives a full page reload", async ({ page }) => {
    const account = user;
    if (!account) throw new Error("test user was not created");
    const front = `E2E front ${Date.now()}`;
    const back = "E2E back";

    // Sign in through the real form (auth → cookie). Success redirects to "/".
    await page.goto("/auth/signin");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/");

    // Open the add-card form. It's a client:load island, so a click can land before
    // hydration; retry until the inputs appear — waiting for state, not time.
    await page.goto("/flashcards");
    const addButton = page.getByRole("button", { name: "Dodaj kartę" });
    await expect(async () => {
      if (await addButton.isVisible()) await addButton.click();
      await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const fields = page.getByRole("textbox");
    await fields.nth(0).fill(front); // Przód
    await fields.nth(1).fill(back); // Tył
    await page.getByRole("button", { name: "Zapisz kartę" }).click();

    // It appears in the collection right after saving (the form closes on success,
    // so this matches the rendered card, not the input).
    await expect(page.getByText(front)).toBeVisible();

    // The actual risk: does it survive a full SSR reload (i.e. is it in the DB)?
    await page.reload();
    await expect(page.getByText(front)).toBeVisible();
  });
});
