import { describe, it, expect } from 'vitest';
import { SHORTCUTS } from './shortcuts';

describe('SHORTCUTS', () => {
  it('has unique ids and keys, so the dispatch table never double-matches', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    const keys = SHORTCUTS.map((s) => s.key);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lets only a shift-typed key opt into firing with Shift held', () => {
    // The listener drops a Shift-held press unless the shortcut asked for it,
    // so `allowsShift` on a key that is not typed with Shift would quietly
    // add a capital-letter duplicate of that shortcut.
    for (const shortcut of SHORTCUTS) {
      if (!shortcut.allowsShift) continue;
      expect(shortcut.key).toBe(shortcut.key.toUpperCase());
      expect(shortcut.key).toBe(shortcut.key.toLowerCase());
    }
  });

  it('leaves Escape without a run — the native <dialog> already closes on it', () => {
    const close = SHORTCUTS.find((s) => s.id === 'close');
    expect(close?.key).toBe('Escape');
    expect(close?.run).toBeUndefined();
  });

  it('every other shortcut has a run so it actually does something', () => {
    const dispatchable = SHORTCUTS.filter((s) => s.id !== 'close');
    expect(dispatchable.length).toBeGreaterThan(0);
    for (const shortcut of dispatchable) {
      expect(shortcut.run).toBeTypeOf('function');
    }
  });
});
