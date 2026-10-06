import { describe, it, expect, vi } from 'vitest';
import {
  SHORTCUTS,
  commandPaletteDisplayKey,
  isCommandPaletteShortcut,
  isModChord,
  modChordDisplayKey,
  type ChordEvent,
} from './shortcuts';

describe('isCommandPaletteShortcut', () => {
  const press = (init: Partial<ChordEvent> & { key: string }): ChordEvent => ({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });

  it('matches Ctrl+K off Apple platforms and Cmd+K on them, whatever the case', () => {
    expect(isCommandPaletteShortcut(press({ key: 'k', ctrlKey: true }), false)).toBe(true);
    expect(isCommandPaletteShortcut(press({ key: 'K', ctrlKey: true }), false)).toBe(true);
    expect(isCommandPaletteShortcut(press({ key: 'k', metaKey: true }), true)).toBe(true);
  });

  it('leaves the other platform’s chord alone (Ctrl+K is kill-line on a Mac)', () => {
    expect(isCommandPaletteShortcut(press({ key: 'k', ctrlKey: true }), true)).toBe(false);
    expect(isCommandPaletteShortcut(press({ key: 'k', metaKey: true }), false)).toBe(false);
  });

  it('ignores a bare K and any other chord', () => {
    expect(isCommandPaletteShortcut(press({ key: 'k' }), false)).toBe(false);
    expect(isCommandPaletteShortcut(press({ key: 'k', ctrlKey: true, altKey: true }), false)).toBe(
      false
    );
    expect(
      isCommandPaletteShortcut(press({ key: 'k', ctrlKey: true, shiftKey: true }), false)
    ).toBe(false);
    expect(isCommandPaletteShortcut(press({ key: 'j', ctrlKey: true }), false)).toBe(false);
  });
});

describe('isModChord', () => {
  const press = (init: Partial<ChordEvent> & { key: string }): ChordEvent => ({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });

  it('matches the platform modifier plus the key, whatever the case', () => {
    expect(isModChord(press({ key: 's', ctrlKey: true }), false, 's')).toBe(true);
    expect(isModChord(press({ key: 'S', ctrlKey: true }), false, 's')).toBe(true);
    expect(isModChord(press({ key: 's', metaKey: true }), true, 's')).toBe(true);
    expect(isModChord(press({ key: 'Enter', ctrlKey: true }), false, 'Enter')).toBe(true);
  });

  it('leaves the other platform’s modifier, a bare key and Alt alone', () => {
    expect(isModChord(press({ key: 's', ctrlKey: true }), true, 's')).toBe(false);
    expect(isModChord(press({ key: 's', metaKey: true }), false, 's')).toBe(false);
    expect(isModChord(press({ key: 's' }), false, 's')).toBe(false);
    expect(isModChord(press({ key: 's', ctrlKey: true, altKey: true }), false, 's')).toBe(false);
  });

  it('treats Shift as part of the chord: Ctrl+S and Ctrl+Shift+S are different keys', () => {
    expect(isModChord(press({ key: 'S', ctrlKey: true, shiftKey: true }), false, 's')).toBe(false);
    expect(
      isModChord(press({ key: 'S', ctrlKey: true, shiftKey: true }), false, 's', { shift: true })
    ).toBe(true);
    expect(isModChord(press({ key: 's', ctrlKey: true }), false, 's', { shift: true })).toBe(false);
  });
});

describe('modChordDisplayKey', () => {
  it('shows the chord as the pilot’s own keyboard labels it', () => {
    expect(modChordDisplayKey(true, 'S')).toBe('⌘S');
    expect(modChordDisplayKey(false, 'S')).toBe('Ctrl S');
    expect(modChordDisplayKey(true, 'S', { shift: true })).toBe('⇧⌘S');
    expect(modChordDisplayKey(false, 'S', { shift: true })).toBe('Ctrl Shift S');
    expect(modChordDisplayKey(true, '↵')).toBe('⌘↵');
    expect(modChordDisplayKey(false, 'Enter')).toBe('Ctrl Enter');
  });
});

describe('commandPaletteDisplayKey', () => {
  it('shows the Command key on Apple platforms and Ctrl elsewhere', () => {
    expect(commandPaletteDisplayKey(true)).toBe('⌘K');
    expect(commandPaletteDisplayKey(false)).toBe('Ctrl K');
  });
});

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

  it.each([
    ['go-to-overview', 'o', '/overview'],
    ['go-to-market', 'm', '/market'],
    ['go-to-industry', 'i', '/industry'],
    ['go-to-wallet', 'w', '/wallet'],
    ['go-to-planetary-industry', 'p', '/planetary-industry'],
    ['go-to-alerts', 'a', '/alerts'],
    ['go-to-mining-tax', 't', '/mining/tax'],
  ])('%s fires on "%s" and navigates to %s', (id, key, path) => {
    const shortcut = SHORTCUTS.find((s) => s.id === id);
    expect(shortcut?.key).toBe(key);
    const navigate = vi.fn();
    shortcut?.run?.(navigate);
    expect(navigate).toHaveBeenCalledWith(path);
  });
});
