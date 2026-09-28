import { preloadSignedInShell } from './routeChunks';
import { readSignedInShellHint, shouldPreloadSignedInShell } from './signedInShellHint';

/**
 * Side-effect module, imported by `main.tsx` straight after `./instrument`:
 * as the entry evaluates, a returning user's signed-in shell chunks start
 * fetching before `App` and i18n have even run their module code, so they are
 * usually in hand by the time `RequireCharacter`'s Dexie read lets `Layout`
 * render. A first-time visitor on /login skips it and never downloads them.
 *
 * Deliberately light: `routeChunks` and the hint helper import nothing at
 * runtime, so this adds no weight ahead of the rest of the entry.
 */
// The router's path, without Vite's `base` (`/` today, so a no-op).
const routerPath = window.location.pathname.slice(import.meta.env.BASE_URL.length - 1);
if (shouldPreloadSignedInShell(routerPath, readSignedInShellHint())) {
  preloadSignedInShell();
}
