// Sessions in D1: our cookie id -> Cozytouch session, kept for a week after the last visit
import { env } from "cloudflare:workers";
import type { APIContext, AstroCookies } from "astro";
import { UpstreamError, type Session } from "@/lib/cozytouch.ts";

const COOKIE = "sid";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
// A visit renews the session only once it is a day old, so most requests don't write
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

// Remembers which row a loaded session came from, so changes can be saved back
const ids = new WeakMap<Session, string>();

const serialize = (session: Session) =>
  JSON.stringify({
    ...session,
    modes: [...session.modes],
    commands: [...session.commands].map(([id, names]) => [id, [...names]]),
  });

const deserialize = (data: string): Session => {
  const stored = JSON.parse(data);
  return {
    ...stored,
    modes: new Map(stored.modes),
    commands: new Map(
      stored.commands.map(([id, names]: [string, string[]]) => [id, new Set(names)]),
    ),
  };
};

const setCookie = (cookies: AstroCookies, id: string) =>
  cookies.set(COOKIE, id, {
    httpOnly: true,
    // Safari drops Secure cookies on http://localhost during development
    secure: import.meta.env.PROD,
    sameSite: "strict",
    path: "/",
    maxAge: TTL_MS / 1000,
  });

export async function getSession(cookies: AstroCookies) {
  const id = cookies.get(COOKIE)?.value;
  if (!id) return undefined;
  const row = await env.DB.prepare(
    "SELECT data, expires_at FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(id, Date.now())
    .first<{ data: string; expires_at: number }>();
  if (!row) return undefined;
  if (row.expires_at - Date.now() < TTL_MS - RENEW_AFTER_MS) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(Date.now() + TTL_MS, id)
      .run();
    setCookie(cookies, id);
  }
  const session = deserialize(row.data);
  ids.set(session, id);
  return session;
}

export async function startSession(cookies: AstroCookies, session: Session) {
  const id = crypto.randomUUID();
  await env.DB.batch([
    // Expired sessions are cleared out whenever someone logs in
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()),
    env.DB.prepare(
      "INSERT INTO sessions (id, data, expires_at) VALUES (?, ?, ?)",
    ).bind(id, serialize(session), Date.now() + TTL_MS),
  ]);
  ids.set(session, id);
  setCookie(cookies, id);
}

// Stores changes made to a loaded session, such as the device commands after loading the list
export async function saveSession(session: Session) {
  const id = ids.get(session);
  if (!id) return;
  await env.DB.prepare("UPDATE sessions SET data = ? WHERE id = ?")
    .bind(serialize(session), id)
    .run();
}

export async function endSession(cookies: AstroCookies) {
  const id = cookies.get(COOKIE)?.value;
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  cookies.delete(COOKIE, { path: "/" });
}

// Runs an API action for the logged-in user and turns errors into JSON responses
export async function withSession(
  { cookies, request, locals }: APIContext,
  action: (session: Session) => Promise<void>,
) {
  const { session } = locals;
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });
  try {
    await action(session);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(`${request.method} ${new URL(request.url).pathname}:`, e);
    const status = e instanceof UpstreamError ? e.status : 500;
    // Expired upstream token/session -> make the browser log in again
    if (status === 401) await endSession(cookies);
    return Response.json(
      { error: (e as Error).message },
      { status: status === 401 ? 401 : status === 400 ? 400 : 500 },
    );
  }
}
