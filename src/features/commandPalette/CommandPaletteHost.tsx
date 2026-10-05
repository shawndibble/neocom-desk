import { lazy, Suspense, useEffect, useState } from 'react';
import { guarded } from '@/app/routeChunks';
import { isApplePlatform, isCommandPaletteShortcut } from '@/lib/shortcuts';
import { CommandPalette } from './CommandPalette';
import type { ShownMarketItem } from './marketItems';
import { useCommandPalette } from './store';

const APPLE = isApplePlatform();

// Lazy: the shell mounts this host on every page, and Item Detail brings ESI,
// SDE and skills code the shell chunk should not carry until an item is picked.
const ItemDetailModal = lazy(() =>
  guarded(() => import('@/features/market/ItemDetailModal')).then((module) => ({
    default: module.ItemDetailModal,
  }))
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
 * A Market Items pick opens Item Detail here rather than in the palette,
 * which closes as it is picked: the modal sits over the current page — no
 * navigation — and hands focus back to it on close.
 */
export function CommandPaletteHost() {
  const open = useCommandPalette((state) => state.open);
  const hide = useCommandPalette((state) => state.hide);
  const [shownItem, setShownItem] = useState<ShownMarketItem | null>(null);

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

  return (
    <>
      {open && <CommandPalette onClose={hide} onShowItem={setShownItem} />}
      {shownItem && (
        <Suspense fallback={null}>
          <ItemDetailModal
            typeId={shownItem.typeId}
            itemName={shownItem.name}
            showOpenInMarket
            onClose={() => setShownItem(null)}
          />
        </Suspense>
      )}
    </>
  );
}
