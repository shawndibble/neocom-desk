import { preloadSignedInShell } from './routeChunks';
import { readSignedInShellHint, shouldPreloadSignedInShell } from './signedInShellHint';
import { currentRouterPathname } from './routerPath';

if (shouldPreloadSignedInShell(currentRouterPathname(), readSignedInShellHint())) {
  preloadSignedInShell();
}
