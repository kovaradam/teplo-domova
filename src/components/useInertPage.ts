import { useEffect } from "react";

/**
 * Makes the page behind an open drawer inert. Radix's aria-hidden leaves any container holding a
 * <script> readable, which is every Astro container here; inert hides the page from screen
 * readers and keeps focus out of it.
 */
export function useInertPage(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const page = [
      ...document.querySelectorAll<HTMLElement>("body > header, body > main"),
    ];
    page.forEach((element) => (element.inert = true));
    return () => page.forEach((element) => (element.inert = false));
  }, [open]);
}
