declare namespace App {
  interface Locals {
    /** Logged-in Cozytouch session, loaded by the middleware. */
    session?: import("@/lib/cozytouch.ts").Session;
  }
}
