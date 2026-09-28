/**
 * A synchronous "this browser has a stored Character" flag, so `main.tsx` can
 * start fetching the signed-in shell (`Layout`, `Overview`) before React has
 * rendered anything — and long before the Dexie read that actually decides the
 * route has come back.
 *
 * Only a hint: it steers a preload, never a routing decision. A stale `true`
 * costs one unneeded chunk fetch; a missing one costs the one Suspense frame
 * the preload exists to hide. `App` keeps it in step with `db.characters`.
 *
 * Device-local (localStorage), and every access is guarded: storage can be
 * blocked outright (a privacy mode, a sandboxed frame), and a boot-path read
 * must not be what takes the app down.
 */
export const SIGNED_IN_SHELL_HINT_KEY = 'neocom:has-character';

export function readSignedInShellHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_SHELL_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSignedInShellHint(hasCharacter: boolean): void {
  try {
    if (hasCharacter) localStorage.setItem(SIGNED_IN_SHELL_HINT_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_SHELL_HINT_KEY);
  } catch {
    // Blocked storage: the preload just never fires, and the lazy route loads
    // on demand as it would for a first visit.
  }
}

/**
 * Whether a boot at `pathname` is headed for the signed-in shell. The SSO
 * callback always is — it stores the new Character and redirects inside — and
 * on a first sign-in it is the one boot that never has a hint yet.
 */
export function shouldPreloadSignedInShell(pathname: string, hint: boolean): boolean {
  return hint || pathname === '/callback' || pathname.startsWith('/callback/');
}
