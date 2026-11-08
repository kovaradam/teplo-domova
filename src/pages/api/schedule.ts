import type { APIRoute } from "astro";
import { exec, scheduleCommand, UpstreamError } from "@/lib/cozytouch.ts";
import { withSession } from "@/lib/session.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session) => {
    const { id, day, periods } = (await context.request.json()) as {
      id: string;
      day: unknown;
      periods: unknown;
    };
    const command = scheduleCommand(day, periods);
    if (!session.commands.get(id)?.has(command.name))
      throw new UpstreamError("Invalid request", 400);
    await exec(session, id, [command]);
  });
