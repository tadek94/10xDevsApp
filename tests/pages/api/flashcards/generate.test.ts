import type { APIContext } from "astro";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI seam BEFORE importing the handler. This binds generate.ts's
// top-level `import { ai, DEFAULT_MODEL } from "@/lib/ai"` to the mock, so the
// real module (and its `astro:env/server` import) never loads. vi.mock is
// hoisted above the imports by Vitest.
vi.mock("@/lib/ai", () => ({
  ai: { chat: { completions: { create: vi.fn() } } },
  DEFAULT_MODEL: "test-model",
}));

import { ai } from "@/lib/ai";
import { POST } from "@/pages/api/flashcards/generate";

// Untyped handle to the mocked create() — lets us resolve with any chosen
// `choices[0].message.content` or reject, without fighting the OpenAI SDK's
// overloaded signature.
// eslint-disable-next-line @typescript-eslint/unbound-method -- mock reference, never invoked with `this`
const createMock = ai.chat.completions.create as unknown as Mock;

// A valid >=50-word body so every pre-AI guard (401/400/zod/<50 words) passes
// and each test exercises only the post-AI parsing/branching — the Risk #1 oracle.
const VALID_TEXT = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");

interface ParsedBody {
  error?: string;
  cards?: { front: string; back: string }[];
}

function makeContext(): APIContext {
  const request = new Request("http://localhost/api/flashcards/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: VALID_TEXT }),
  });
  return { locals: { user: { id: "user-1" } }, request } as unknown as APIContext;
}

async function readBody(res: Response): Promise<ParsedBody> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Response.json() resolves to `any`; this narrows it for safe access
  return (await res.json()) as ParsedBody;
}

function aiReturns(content: string | null): void {
  createMock.mockResolvedValue({ choices: [{ message: { content } }] });
}

function card(n: number): { front: string; back: string } {
  return { front: `Q${n}`, back: `A${n}` };
}

describe("POST /api/flashcards/generate — bad-response handling (Risk #1)", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  // Each row is a distinct regression: a model response that must NOT crash the
  // flow but instead yield a clean 422 + "No cards generated" so the UI can
  // surface an error and the manual-creation fallback (FR-005) stays reachable.
  it.each([
    ["non-JSON text", "this is not json at all"],
    ["an empty string", ""],
    ["null content", null],
    ["a valid JSON empty array", "[]"],
    ["a valid JSON object (non-array)", "{}"],
    ["a valid JSON null literal", "null"],
    ["an array of objects without string front/back", JSON.stringify([{ front: 1, back: 2 }, { foo: "bar" }])],
  ])("returns 422 'No cards generated' when model content is %s", async (_label, content) => {
    aiReturns(content);

    const res = await POST(makeContext());

    expect(res.status).toBe(422);
    const data = await readBody(res);
    expect(data.error).toBe("No cards generated");
  });

  // The single most valuable assertion (history F3): a THROWN AI call is 502,
  // distinct from malformed CONTENT (422). These were once one combined catch;
  // collapsing them back is the most likely future regression, and nothing but
  // this test guards the split.
  it("returns 502 'AI service unavailable' (NOT 422) when the AI call throws", async () => {
    createMock.mockRejectedValue(new Error("simulated 5xx / timeout / network"));

    const res = await POST(makeContext());

    expect(res.status).toBe(502);
    expect(res.status).not.toBe(422);
    const data = await readBody(res);
    expect(data.error).toBe("AI service unavailable");
  });

  it("returns 200 with validated cards, capped at 15", async () => {
    aiReturns(JSON.stringify(Array.from({ length: 20 }, (_, i) => card(i))));

    const res = await POST(makeContext());

    expect(res.status).toBe(200);
    const data = await readBody(res);
    expect(data.cards).toHaveLength(15);
    // Shape only — never assert exact card text (oracle problem; model output is volatile).
    expect(data.cards?.every((c) => typeof c.front === "string" && typeof c.back === "string")).toBe(true);
  });

  it("returns 200 when well-formed JSON is wrapped in markdown fences", async () => {
    const fenced = "```json\n" + JSON.stringify([card(1), card(2)]) + "\n```";
    aiReturns(fenced);

    const res = await POST(makeContext());

    expect(res.status).toBe(200);
    const data = await readBody(res);
    expect(data.cards).toHaveLength(2);
  });
});
