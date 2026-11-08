import type { APIRoute } from "astro";
import { exec, UpstreamError, type Mode } from "@/lib/cozytouch.ts";
import { withSession } from "@/lib/session.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session) => {
    const { id, mode } = (await context.request.json()) as { id: string; mode: string };
    // Commands were picked from the device definition when the list was loaded
    const commands = session.modes.get(id)?.[mode as Mode];
    if (!commands) throw new UpstreamError("Invalid request", 400);
    await exec(session, id, commands);
  });
