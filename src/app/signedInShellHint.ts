import { readLocal, removeLocal, writeLocal } from '@/lib/safeLocalStorage';

export const SIGNED_IN_SHELL_HINT_KEY = 'neocom:has-character';

export function readSignedInShellHint(): boolean {
  return readLocal(SIGNED_IN_SHELL_HINT_KEY) === '1';
}

export function writeSignedInShellHint(hasCharacter: boolean): void {
  if (hasCharacter) writeLocal(SIGNED_IN_SHELL_HINT_KEY, '1');
  else removeLocal(SIGNED_IN_SHELL_HINT_KEY);
}

export function shouldPreloadSignedInShell(pathname: string, hint: boolean): boolean {
  return hint || pathname === '/callback' || pathname.startsWith('/callback/');
}
