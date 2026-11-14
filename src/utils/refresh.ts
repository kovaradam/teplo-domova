/**
 * Keeps server-rendered parts of the page current. Elements with `data-refresh="<url>"` get
 * their content fetched again when the app comes back into view and every few minutes while
 * it's visible, but never while the user is in the middle of something.
 */
const REFRESHED = "content-refresh";
const INTERVAL_MS = 2 * 60 * 1000;
// Typing, dragging or a stepper waiting to send all start with an interaction
const QUIET_MS = 5000;

let last = Date.now();
let stale = false;
let interacted = 0;

const busy = () =>
  Date.now() - interacted < QUIET_MS ||
  Number(document.documentElement.dataset.pending ?? 0) > 0 ||
  // An open drawer makes the page inert; the week schedule marks drags and saves
  document.querySelector("[inert], [data-dragging], [data-saving]") !== null ||
  document.activeElement?.matches("input, select, textarea") === true;

async function refresh() {
  if (document.hidden || busy()) return;
  last = Date.now();
  stale = false;
  const targets = [...document.querySelectorAll<HTMLElement>("[data-refresh]")];
  const pages = await Promise.all(
    targets.map((target) =>
      fetch(target.dataset.refresh!)
        .then((res) => (res.ok ? res.text() : null))
        .catch(() => null),
    ),
  );
  // The user may have started something while the requests were out
  if (busy()) return void (stale = true);
  const focused = document.activeElement?.id;
  targets.forEach((target, i) => {
    const html = pages[i];
    // A contextual fragment runs its scripts, like the expired-session redirect
    if (html !== null)
      target.replaceChildren(
        document.createRange().createContextualFragment(html),
      );
  });
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  document.dispatchEvent(new Event(REFRESHED));
}

export function startRefreshing() {
  for (const type of ["pointerdown", "keydown", "input"])
    addEventListener(type, () => (interacted = Date.now()), {
      capture: true,
      passive: true,
    });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    stale = true;
    refresh();
  });
  // Covers refreshes that had to wait, and the regular interval
  setInterval(() => {
    if (stale || Date.now() - last >= INTERVAL_MS) refresh();
  }, 15 * 1000);
}

/**
 * Runs `setup` once for every element matching `selector`: those on the page now and those
 * arriving with refreshed content.
 */
export function setupEach<T extends HTMLElement>(
  selector: string,
  setup: (element: T) => void,
) {
  const run = () => {
    for (const element of document.querySelectorAll<T>(
      `${selector}:not([data-ready])`,
    )) {
      element.dataset.ready = "";
      setup(element);
    }
  };
  run();
  document.addEventListener(REFRESHED, run);
}
