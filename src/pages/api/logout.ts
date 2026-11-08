import type { APIRoute } from "astro";
import { endSession } from "@/lib/session.ts";

export const POST: APIRoute = ({ cookies, redirect }) => {
  endSession(cookies);
  return redirect("/login", 303);
};
