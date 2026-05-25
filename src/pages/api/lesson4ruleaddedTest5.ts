import type { APIRoute } from "astro";
import { formatDate } from "@/lib/utils";

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ date: formatDate(new Date()) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
