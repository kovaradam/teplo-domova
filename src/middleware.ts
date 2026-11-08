import { defineMiddleware } from "astro:middleware";
import { getSession } from "@/lib/session.ts";

// Device list needs a session; the login page doesn't make sense with one
export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
  const loggedIn = !!getSession(cookies);
  if (url.pathname === "/" && !loggedIn) return redirect("/login");
  if (url.pathname === "/login" && loggedIn) return redirect("/");
  return next();
});
