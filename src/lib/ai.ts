import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "astro:env/server";

export const DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free";

export const ai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY ?? "",
});
