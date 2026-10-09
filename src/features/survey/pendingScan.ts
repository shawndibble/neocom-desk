/**
 * A Survey Scan pasted on a shared page that is a different field than the one
 * shown, waiting for the pilot to log in. Starting a Survey needs a session, and
 * logging in leaves the app for EVE SSO and comes back to a fresh page load, so
 * the text waits in local storage (session storage would also survive, but a
 * login can open in another tab). Taken once and short-lived: a stale paste must
 * not turn up in a survey days later.
 */
export const PENDING_SCAN_TTL_MS = 30 * 60 * 1000;

const KEY = 'miningSurveyPendingScan';

export function stashPendingScan(text: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ text, at: now }));
  } catch {
    // Best-effort: the pilot can paste again after logging in.
  }
}

/** The stashed text if it is fresh; clears the stash either way. */
export function takePendingScan(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== 'string' || typeof parsed.at !== 'number') return null;
    return now - parsed.at <= PENDING_SCAN_TTL_MS ? parsed.text : null;
  } catch {
    return null;
  }
}
