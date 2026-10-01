/**
 * Where a login should land once SSO comes back, instead of the ordinary
 * post-login `/characters`. Two writers: the logged-out Fitting Share Link
 * view (#1544), whose "Open in Neocom Desk" CTA needs the *same* link to open
 * in the editor, and `app/loginFlow`'s `beginEveLogin`, so a re-auth or a
 * Permission grant returns to the page it was pressed on.
 *
 * `sessionStorage`, not React Router `state`: SSO leaves the app for a full
 * page navigation to login.eveonline.com and back, which router state does
 * not survive. Always consumed on read and bounded by the same TTL as
 * `session.ts`'s Pending Login, so it outlasts a visitor hesitating on EVE's
 * own login page but no login that could still complete. A leftover value
 * from an abandoned login can only misdirect a *different* login in the same
 * tab within that window — never a different visitor or a different tab, and
 * the worst case is landing on the wrong in-app page, not a security
 * exposure.
 */
const KEY = 'neocom.loginReturnTo';
const TTL_MS = 15 * 60_000;

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

/**
 * A browser location as a path the router can navigate to: query and hash
 * kept, Vite's `BASE_URL` stripped, since the router is mounted under it
 * (`app/App.tsx`'s `basename`).
 */
export function routerPathOf(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  baseUrl: string
): string {
  const base = baseUrl.replace(/\/$/, '');
  const { pathname } = location;
  const path = base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  return `${path}${location.search}${location.hash}`;
}
