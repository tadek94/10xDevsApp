import type { APIRoute } from "astro";
import { z } from "zod";
import { ai, DEFAULT_MODEL } from "@/lib/ai";

export const prerender = false;

const GenerateSchema = z.object({
  text: z.string().min(1, "Text is required"),
});

function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/s, "$1").trim();
}

const GENERATION_PROMPT = `You are an expert study aid generator. Extract key concepts from the source text and create flashcard pairs.

Rules:
- Generate up to 15 pairs; quality over quantity — one card per distinct concept worth memorizing
- Use the SAME language as the source text for both front and back
- Front: concise question or prompt
- Back: clear, accurate answer (1–3 sentences)
- Return ONLY a valid JSON array, no preamble, no markdown fences:
[{"front": "...", "back": "..."}, ...]`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { text } = parsed.data;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) {
    return Response.json({ error: "Text must be at least 50 words" }, { status: 400 });
  }

  try {
    const completion = await ai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: GENERATION_PROMPT },
        { role: "user", content: `Source text:\n${text}` },
      ],
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = stripMarkdownFences(raw);
    const cards: unknown = JSON.parse(cleaned);

    if (!Array.isArray(cards) || cards.length === 0) {
      return Response.json({ error: "No cards generated" }, { status: 422 });
    }

    const validated = (cards as unknown[])
      .filter(
        (c): c is { front: string; back: string } =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).front === "string" &&
          typeof (c as Record<string, unknown>).back === "string",
      )
      .slice(0, 15);

    if (validated.length === 0) {
      return Response.json({ error: "No cards generated" }, { status: 422 });
    }

    return Response.json({ cards: validated });
  } catch {
    return Response.json({ error: "AI service error" }, { status: 422 });
  }
};
