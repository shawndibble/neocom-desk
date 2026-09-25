/**
 * Where a login started outside the ordinary in-app flow should land once it
 * completes — today, only the logged-out Fitting Share Link view (#1544),
 * whose "Open in Neocom Desk" CTA needs the *same* link to open in the
 * editor once SSO comes back, not the ordinary post-login `/characters`.
 *
 * `sessionStorage`, not React Router `state`: SSO leaves the app for a full
 * page navigation to login.eveonline.com and back, which router state does
 * not survive. Always consumed on read and bounded by a short TTL, so a
 * leftover value from an abandoned share-view login can only misdirect a
 * *different* login in the same tab within a few minutes of it — never a
 * different visitor or a different tab, and the worst case is landing on the
 * wrong in-app page, not a security exposure. Kept short (rather than
 * `session.ts`'s 15-minute PKCE TTL, which has to outlast a visitor
 * hesitating on EVE's own login page) because nothing here needs to survive
 * that long.
 */
const KEY = 'neocom.loginReturnTo';
const TTL_MS = 5 * 60_000;

interface Stashed {
  path: string;
  createdAt: number;
}

/** Best-effort, like every sessionStorage write in `auth/session.ts` — a login must not fail over a storage write. */
export function setLoginReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, createdAt: Date.now() } satisfies Stashed));
  } catch {
    // No return-to lands the login on the ordinary default instead.
  }
}

/** Reads and clears the stash; `null` when absent, unreadable, or expired. */
export function takeLoginReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Stashed>;
    if (typeof parsed.path !== 'string' || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > TTL_MS) return null;
    return parsed.path;
  } catch {
    return null;
  }
}
