import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashcardGenerator } from "@/components/flashcards/FlashcardGenerator";

// A >=50-word source text so the "Generuj" button enables (wordCount >= 50).
const VALID_TEXT = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

// Render, type a valid source text, and return the (now-enabled) Generuj button.
function renderAndPrime() {
  const user = userEvent.setup();
  render(<FlashcardGenerator />);
  const textarea = screen.getByLabelText("Tekst źródłowy");
  fireEvent.change(textarea, { target: { value: VALID_TEXT } });
  const button = screen.getByRole("button", { name: /Generuj/i });
  expect(button).toBeEnabled();
  return { user, button };
}

describe("FlashcardGenerator — anti-frozen-UI on failed generation (Risk #1)", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  // The top user fear (interview Q1; PRD :122) is a blank/frozen screen. The
  // anti-frozen guarantee is the island's `finally { setIsGenerating(false) }`:
  // on every failure the error surfaces AND the button re-enables, so the
  // manual-creation fallback stays reachable. Each row is a distinct failure face.
  it.each([
    ["a 422 error body", jsonResponse(422, { error: "No cards generated" }), "No cards generated"],
    ["a 502 error body", jsonResponse(502, { error: "AI service unavailable" }), "AI service unavailable"],
  ])("shows the returned error and re-enables the button on %s", async (_label, response, expectedMessage) => {
    fetchMock.mockResolvedValue(response);
    const { user, button } = renderAndPrime();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    });
    // No frozen UI: the button is interactive again (not stuck on "Generuję...").
    expect(screen.getByRole("button", { name: /Generuj/i })).toBeEnabled();
  });

  it("shows a connection error and re-enables the button when fetch rejects (network)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const { user, button } = renderAndPrime();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Nie można połączyć się z serwerem.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Generuj/i })).toBeEnabled();
  });

  // Debugging-as-test (m3l5): a swallowed catch destroys the only evidence a
  // debugger would have. The user may still see a friendly message, but the real
  // error must reach a log channel (OWASP A10:2025 logging/monitoring failures).
  it("logs the underlying error instead of swallowing it when fetch rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const underlying = new Error("boom: unexpected failure");
    fetchMock.mockRejectedValue(underlying);
    const { user, button } = renderAndPrime();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Nie można połączyć się z serwerem.")).toBeInTheDocument();
    });
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), underlying);
    consoleError.mockRestore();
  });

  it("renders suggestions and no error banner on a successful generation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        cards: [
          { front: "Q1", back: "A1" },
          { front: "Q2", back: "A2" },
        ],
      }),
    );
    const { user, button } = renderAndPrime();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Sugestie \(/)).toBeInTheDocument();
    });
    // No error surfaced on the happy path.
    expect(screen.queryByText(/błąd|Nie można połączyć/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generuj/i })).toBeEnabled();
  });

  it("redirects to /auth/signin when the endpoint returns 401", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    // jsdom can't perform navigation, so replace window.location with a plain
    // object whose `href` we can read back. Restore it afterwards.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    });

    try {
      const { user, button } = renderAndPrime();

      await user.click(button);

      await waitFor(() => {
        expect(window.location.href).toBe("/auth/signin");
      });
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
