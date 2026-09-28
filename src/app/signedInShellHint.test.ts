// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SIGNED_IN_SHELL_HINT_KEY,
  readSignedInShellHint,
  shouldPreloadSignedInShell,
  writeSignedInShellHint,
} from './signedInShellHint';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('signed-in shell hint', () => {
  it('reads false when nothing was ever written', () => {
    expect(readSignedInShellHint()).toBe(false);
  });

  it('round-trips a stored Character', () => {
    writeSignedInShellHint(true);
    expect(localStorage.getItem(SIGNED_IN_SHELL_HINT_KEY)).toBe('1');
    expect(readSignedInShellHint()).toBe(true);
  });

  it('clears itself once the last Character is gone', () => {
    writeSignedInShellHint(true);
    writeSignedInShellHint(false);
    expect(localStorage.getItem(SIGNED_IN_SHELL_HINT_KEY)).toBeNull();
    expect(readSignedInShellHint()).toBe(false);
  });

  it('treats blocked storage as "no hint" rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => writeSignedInShellHint(true)).not.toThrow();
    expect(readSignedInShellHint()).toBe(false);
  });
});

describe('shouldPreloadSignedInShell', () => {
  it('preloads for a returning user on any path', () => {
    expect(shouldPreloadSignedInShell('/', true)).toBe(true);
    expect(shouldPreloadSignedInShell('/wallet', true)).toBe(true);
  });

  it('preloads on the SSO callback, which redirects into the shell before any hint exists', () => {
    expect(shouldPreloadSignedInShell('/callback', false)).toBe(true);
  });

  it('leaves a first-time visitor on the landing page alone', () => {
    expect(shouldPreloadSignedInShell('/', false)).toBe(false);
    expect(shouldPreloadSignedInShell('/login', false)).toBe(false);
    expect(shouldPreloadSignedInShell('/share/fitting', false)).toBe(false);
  });
});
