import { defineMiddleware } from "astro:middleware";
import { getSession } from "@/lib/session.ts";

// Loads the session once per request; the device list needs one, the login page doesn't make sense with one
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, redirect } = context;
  locals.session = await getSession(cookies);
  if (url.pathname === "/" && !locals.session) return redirect("/login");
  if (url.pathname === "/login" && locals.session) return redirect("/");
  return next();
});
