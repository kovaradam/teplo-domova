/**
 * Posts a device command to an API route from the browser. Returns `true` when
 * Overkiz accepted it. On failure it dispatches a bubbling `command-error`
 * event from `source` with the message, and sends the browser to the login
 * page when the session is gone.
 */
export async function sendCommand(
  source: Element,
  url: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = "/login";
    return false;
  }
  if (res.ok) return true;
  const { error } = await res.json().catch(() => ({ error: res.statusText }));
  source.dispatchEvent(
    new CustomEvent("command-error", { bubbles: true, detail: error }),
  );
  return false;
}
