// In-memory sessions: our cookie id -> Cozytouch session. Restarting the server logs everyone out.
import type { APIContext, AstroCookies } from "astro";
import { UpstreamError, type Session } from "@/lib/cozytouch.ts";

const COOKIE = "sid";
const sessions = new Map<string, Session>();

export function getSession(cookies: AstroCookies) {
  const id = cookies.get(COOKIE)?.value;
  return id ? sessions.get(id) : undefined;
}

export function startSession(cookies: AstroCookies, session: Session) {
  const id = crypto.randomUUID();
  sessions.set(id, session);
  cookies.set(COOKIE, id, { httpOnly: true, sameSite: "strict", path: "/" });
}

export function endSession(cookies: AstroCookies) {
  const id = cookies.get(COOKIE)?.value;
  if (id) sessions.delete(id);
  cookies.delete(COOKIE, { path: "/" });
}

// Runs an API action for the logged-in user and turns errors into JSON responses
export async function withSession(
  { cookies, request }: APIContext,
  action: (session: Session) => Promise<void>,
) {
  const session = getSession(cookies);
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });
  try {
    await action(session);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(`${request.method} ${new URL(request.url).pathname}:`, e);
    const status = e instanceof UpstreamError ? e.status : 500;
    // Expired upstream token/session -> make the browser log in again
    if (status === 401) endSession(cookies);
    return Response.json(
      { error: (e as Error).message },
      { status: status === 401 ? 401 : status === 400 ? 400 : 500 },
    );
  }
}
