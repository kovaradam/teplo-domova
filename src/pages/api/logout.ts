import type { APIRoute } from "astro";
import { endSession } from "@/lib/session.ts";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await endSession(cookies);
  return redirect("/login", 303);
};
