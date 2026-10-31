import { lazy, Suspense, useEffect } from 'react';
import { guarded } from '@/app/routeChunks';
import { isApplePlatform, isCommandPaletteShortcut } from '@/lib/shortcuts';
import { useCommandPalette } from './store';

const APPLE = isApplePlatform();

// Lazy: the palette drags `@/db`, the SDE loader and providers; the shell
// should not carry them until the palette first opens. Ctrl+K preloads it.
const loadCommandPalette = () => guarded(() => import('./CommandPalette'));
const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette }))
);

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
 * Also opened from the rail's Go to button and the More sheet's search field
 * (scope decision `20261002-145653-go-to-button-opens-the-command-palette`),
 * through the same store. Help › Shortcuts lists the chord.
 *
 * The palette mounts only while open, so its live reads (Characters, corp
 * access) cost nothing the rest of the time and every opening starts clean.
 * A Market Items pick navigates to the Market Browser on that item.
 */
export function CommandPaletteHost() {
  const open = useCommandPalette((state) => state.open);
  const hide = useCommandPalette((state) => state.hide);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteShortcut(event, APPLE)) return;
      event.preventDefault();
      void loadCommandPalette().catch(() => {});
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

  return (
    <>
      {open && (
        <Suspense fallback={null}>
          <CommandPalette onClose={hide} />
        </Suspense>
      )}
    </>
  );
}
