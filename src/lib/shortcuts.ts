import type { NavigateFunction } from 'react-router-dom';

/**
 * Router `location.state` shape the "jump to search" shortcut navigates
 * `/market` with. Shared so the producer here and the consumer in
 * `routes/Market.tsx` can't silently drift apart.
 */
export interface MarketFocusSearchState {
  readonly focusSearch: true;
}

/**
 * Router `location.state` shape a Fitting's Export menu navigates
 * `/market/appraisal` with: the multibuy text to appraise on arrival. Shared
 * so the producer (`features/fittings`) and the consumer (`routes/Market.tsx`)
 * can't silently drift apart.
 */
export interface MarketAppraiseState {
  readonly appraiseText: string;
}

/**
 * Marks an element that owns the keyboard while it is on screen but is not a
 * native `<dialog>` and carries no menu/listbox/dialog role the guard in
 * `app/useKeyboardShortcuts.ts` already recognises — today that means the
 * Market Compare drawer, deliberately a non-modal `<section>` so the order
 * book beside it stays live (`features/market/CompareDrawer.tsx`).
 *
 * An explicit opt-in attribute rather than a borrowed `role="dialog"`: the
 * drawer is not a dialog, and saying it is to get a keyboard guard would
 * announce it as one to every screen reader.
 */
export const KEYBOARD_OVERLAY_ATTRIBUTE = 'data-keyboard-overlay';

/**
 * Present in the DOM only while something owns the keyboard. `[role="dialog"]`
 * covers the Radix primitives that render a plain `div` — Popover and
 * HoverCard — which `dialog[open]` cannot match, since that selector needs the
 * native element.
 */
export const OVERLAY_SELECTOR = `dialog[open], [role="menu"], [role="listbox"], [role="dialog"], [${KEYBOARD_OVERLAY_ATTRIBUTE}]`;

export interface ShortcutDef {
  readonly id: string;
  /** Matches `KeyboardEvent.key` exactly. Ctrl/Meta/Alt never reach a match; Shift does, via `allowsShift`. */
  readonly key: string;
  /** What the key looks like on screen — kept separate from `key` since `key` must match the DOM event verbatim ('Escape', not 'Esc'). */
  readonly displayKey: string;
  /**
   * True for a key that is *typed* with Shift on a common layout — `?` is
   * Shift+/ on a US keyboard. Without it the listener drops every Shift-held
   * press, which made the one key every user already reaches for
   * unreachable. Matching still goes through `key`, so a layout that types
   * the same character without Shift reaches the same shortcut.
   */
  readonly allowsShift?: true;
  /** i18next key for the action's description, shown in the Settings shortcut list. */
  readonly descriptionKey: string;
  /**
   * Absent for a shortcut whose behaviour already exists elsewhere — Escape
   * closing the open `<dialog>` is native, not something a listener should
   * also handle. Still listed, so it's discoverable per issue #25.
   */
  readonly run?: (navigate: NavigateFunction) => void;
}

/**
 * The app's global keyboard shortcuts — one source of truth consumed by
 * `app/useKeyboardShortcuts.ts` (dispatch) and `routes/Settings.tsx`
 * (discoverability list). Adding a shortcut is a data change here, not a new
 * `addEventListener` call anywhere.
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'jump-to-search',
    key: '/',
    displayKey: '/',
    descriptionKey: 'shortcuts.jumpToSearch',
    run: (navigate) =>
      navigate('/market', { state: { focusSearch: true } satisfies MarketFocusSearchState }),
  },
  {
    id: 'switch-character',
    key: 'c',
    displayKey: 'C',
    descriptionKey: 'shortcuts.switchCharacter',
    run: (navigate) => navigate('/characters'),
  },
  {
    id: 'open-settings',
    key: ',',
    displayKey: ',',
    descriptionKey: 'shortcuts.openSettings',
    run: (navigate) => navigate('/settings'),
  },
  {
    id: 'show-shortcuts',
    key: '?',
    displayKey: '?',
    allowsShift: true,
    descriptionKey: 'shortcuts.showShortcuts',
    // The list this opens is the one rendered from this very array, under the
    // `#shortcuts` anchor on Settings' General tab.
    run: (navigate) => navigate('/settings/general#shortcuts'),
  },
  {
    id: 'close',
    key: 'Escape',
    displayKey: 'Esc',
    descriptionKey: 'shortcuts.close',
  },
];
