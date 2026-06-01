import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "astro:env/server";

export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";

export const ai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY ?? "",
});
