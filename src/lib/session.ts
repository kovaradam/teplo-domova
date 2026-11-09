// Sessions in D1: our cookie id -> Cozytouch session, kept as long as browsers allow and renewed on use
import { env } from "cloudflare:workers";
import type { APIContext, AstroCookies } from "astro";
import { login, UpstreamError, type Session } from "@/lib/cozytouch.ts";

const COOKIE = "sid";
const DAY_MS = 24 * 60 * 60 * 1000;
// Browsers cap cookie lifetimes at about 400 days
const TTL_MS = 400 * DAY_MS;
// A visit renews the session only once it is a day old, so most requests don't write
const RENEW_AFTER_MS = DAY_MS;

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
    // Strict cookies are left out when an installed web app launches or follows the login redirect
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });

// The Cozytouch password, encrypted with AES-GCM under a key derived from the SESSION_SECRET secret
const text = new TextEncoder();
const toBase64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function passwordKey() {
  if (!env.SESSION_SECRET) return null;
  const digest = await crypto.subtle.digest("SHA-256", text.encode(env.SESSION_SECRET));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(password: string, email: string) {
  const key = await passwordKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: text.encode(email) },
    key,
    text.encode(password),
  );
  return `${toBase64(iv)}.${toBase64(sealed)}`;
}

async function unseal(sealed: string, email: string) {
  const key = await passwordKey();
  if (!key) return null;
  const [iv, data] = sealed.split(".").map(fromBase64);
  const password = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: text.encode(email) },
    key,
    data,
  );
  return new TextDecoder().decode(password);
}

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

export async function startSession(
  cookies: AstroCookies,
  session: Session,
  credentials: { email: string; password: string },
) {
  const sealed = await seal(credentials.password, credentials.email);
  if (sealed) session.credentials = { email: credentials.email, password: sealed };
  else console.warn("SESSION_SECRET is not set; the login will end when the Cozytouch token expires");
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

/**
 * Runs a Cozytouch call; when its token or Overkiz cookie has expired (401), logs in again
 * with the stored password and retries once. A rejected password still ends in a 401.
 */
export async function withRelogin<T>(session: Session, call: () => Promise<T>) {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof UpstreamError && e.status === 401) || !session.credentials)
      throw e;
    const { email, password: sealed } = session.credentials;
    const password = await unseal(sealed, email).catch(() => null);
    if (!password) throw e;
    const fresh = await login(email, password);
    session.token = fresh.token;
    session.overkizCookie = fresh.overkizCookie;
    session.name = fresh.name ?? session.name;
    await saveSession(session);
    console.info("Cozytouch login renewed");
    return await call();
  }
}

// Runs an API action for the logged-in user and turns errors into JSON responses
export async function withSession(
  { cookies, request, locals }: APIContext,
  action: (session: Session) => Promise<void>,
) {
  const { session } = locals;
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });
  try {
    await withRelogin(session, () => action(session));
    return Response.json({ ok: true });
  } catch (e) {
    console.error(`${request.method} ${new URL(request.url).pathname}:`, e);
    const status = e instanceof UpstreamError ? e.status : 500;
    // The stored login no longer works -> make the browser log in again
    if (status === 401) await endSession(cookies);
    return Response.json(
      { error: (e as Error).message },
      { status: status === 401 ? 401 : status === 400 ? 400 : 500 },
    );
  }
}
