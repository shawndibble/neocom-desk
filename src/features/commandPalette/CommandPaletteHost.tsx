import { useEffect } from 'react';
import { isApplePlatform, isCommandPaletteShortcut } from '@/lib/shortcuts';
import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from './store';

const APPLE = isApplePlatform();

/**
 * The Ctrl+K / Cmd+K listener and the palette itself, mounted once from
 * `Layout`. Its own component, like `KeyboardShortcuts`, so the shell never
 * subscribes to the open state or the router.
 *
 * Unlike the single-key listener this one is always attached — the WCAG
 * 2.1.4 off switch is about unmodified keys — and it fires from inside a text
 * field, where Ctrl+K is exactly what a pilot mid-search reaches for.
 * `preventDefault` keeps the browser's own Ctrl+K (focus the address bar's
 * search) from firing too. Pressing it again closes the palette.
 *
 * The shortcut is the only way in: there is no on-screen trigger, by the
 * user's call, so the palette takes no room in the rail or atop a phone page.
 * Settings › Keyboard shortcuts lists the chord.
 *
 * The palette mounts only while open, so its live reads (Characters, corp
 * access) cost nothing the rest of the time and every opening starts clean.
 */
export function CommandPaletteHost() {
  const open = useCommandPalette((state) => state.open);
  const hide = useCommandPalette((state) => state.hide);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteShortcut(event, APPLE)) return;
      event.preventDefault();
      const { open, toggle } = useCommandPalette.getState();
      // Not over another dialog: two stacked modals would leave Escape
      // closing the palette back onto a dialog the pilot had forgotten.
      if (!open && document.querySelector('dialog[open]')) return;
      toggle();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Signing out unmounts the shell; the next shell must not open pre-opened.
  useEffect(() => () => useCommandPalette.getState().hide(), []);

  return open ? <CommandPalette onClose={hide} /> : null;
}
