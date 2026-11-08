import type { APIRoute } from "astro";
import { exec, SETTINGS, UpstreamError, type Setting } from "@/lib/cozytouch.ts";
import { withSession } from "@/lib/session.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session) => {
    const { id, temperature, setting = "target" } = (await context.request.json()) as {
      id?: unknown;
      temperature?: unknown;
      setting?: string;
    };
    const command = SETTINGS[setting as Setting];
    if (
      typeof id !== "string" ||
      !Number.isFinite(temperature) ||
      !command ||
      !session.commands.get(id)?.has(command)
    )
      throw new UpstreamError("Invalid request", 400);
    await exec(session, id, [{ name: command, parameters: [temperature] }]);
  });
