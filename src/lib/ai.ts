// OpenRouter-backed OpenAI client. This is the AI seam for Risk #1 (test-plan.md §2):
// edits here trigger the related-tests hook (generate endpoint + island).
import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "astro:env/server";

export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
export const FALLBACK_MODEL = "google/gemma-4-31b-it:free";

// Tried in order by the generate endpoint. NOTE: both are `:free`, so they share
// the account-wide `free-models-per-day` budget — the fallback only rescues a
// per-model/per-minute blip or one model being down, NOT an exhausted daily quota.
export const MODEL_CHAIN = [DEFAULT_MODEL, FALLBACK_MODEL];

export const ai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY ?? "",
});
