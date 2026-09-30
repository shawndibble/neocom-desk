import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { controlHeightClassName } from '@/components/ui/controlStyles';
import {
  commandPaletteDisplayKey,
  isApplePlatform,
  isCommandPaletteShortcut,
} from '@/lib/shortcuts';
import { CommandPalette } from './CommandPalette';
import type { ShownMarketItem } from './marketItems';
import { useCommandPalette } from './store';

const APPLE = isApplePlatform();
const SHORTCUT_LABEL = commandPaletteDisplayKey(APPLE);

// Lazy: the shell mounts this host on every page, and Item Detail brings ESI,
// SDE and skills code the shell chunk should not carry until an item is picked.
const ItemDetailModal = lazy(() =>
  import('@/features/market/ItemDetailModal').then((module) => ({
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

interface CommandPaletteTriggerProps {
  /** `rail`: the desktop rail's search row. `bar`: the phone's full-width row atop the page. */
  readonly presentation: 'rail' | 'bar';
  readonly className?: string;
}

/**
 * The visible way in, for pointer and touch: a search-box-shaped button. The
 * chord hint is shown on the rail only — a phone has no keyboard to press it on.
 */
export function CommandPaletteTrigger({ presentation, className }: CommandPaletteTriggerProps) {
  const { t } = useTranslation();
  const show = useCommandPalette((state) => state.show);
  const rail = presentation === 'rail';
  return (
    <button
      type="button"
      onClick={show}
      aria-haspopup="dialog"
      aria-keyshortcuts={APPLE ? 'Meta+K' : 'Control+K'}
      className={cx(
        'flex w-full items-center gap-2 rounded-xs border border-line bg-bg/60 text-left text-text-dim transition-colors hover:border-accent/60 hover:text-text',
        controlHeightClassName[rail ? 'sm' : 'md'],
        rail ? 'px-2 text-xs' : 'px-3 text-sm',
        className
      )}
    >
      <Icon.Search size={Icon.ICON_SIZE.md} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {t(rail ? 'commandPalette.trigger' : 'commandPalette.triggerLong')}
      </span>
      {rail && (
        <kbd
          aria-hidden="true"
          className="shrink-0 rounded-xs border border-line bg-panel-2 px-1 font-mono text-[0.6875rem] text-text-faint"
        >
          {SHORTCUT_LABEL}
        </kbd>
      )}
    </button>
  );
}
