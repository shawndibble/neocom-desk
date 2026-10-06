import type { NavigateFunction } from 'react-router-dom';

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
 * Router `location.state` shape the app-wide paste router
 * (`app/GlobalPasteRouter.tsx`) navigates the Fittings tab with: a pasted EFT
 * fit, opened in the editor on arrival. Shared so the producer and the
 * consumer (`routes/Fittings.tsx`) can't silently drift apart.
 */
export interface FittingLoadState {
  readonly fittingLoadText: string;
}

/**
 * Router `location.state` shape a Fitting's Export menu navigates `/industry`
 * with: the fit's EFT text, pre-filled and parsed into the Fit Import dialog
 * on arrival ("Manufacture Plan"). Shared so the producer
 * (`features/fittings`) and the consumer (`routes/Industry.tsx`) can't
 * silently drift apart.
 */
export interface IndustryFitImportState {
  readonly fitImportText: string;
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

/** A field the pilot types into — global keys and pastes leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Ctrl+K / Cmd+K, the Command Palette (#2318). Not a `SHORTCUTS` row: that
 * table is single unmodified keys, dispatched by a listener that ignores
 * modifiers and is switched off entirely with single-key shortcuts (WCAG
 * 2.1.4). A modified chord is not what that criterion is about, so this one
 * stays live regardless — its listener is `CommandPaletteHost`'s
 * (`features/commandPalette`), and it fires from inside a text field too.
 *
 * Shift and Alt narrow rather than widen, as in the single-key table.
 */
export type ChordEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export function isCommandPaletteShortcut(event: ChordEvent, apple: boolean): boolean {
  return isModChord(event, apple, 'k');
}

/**
 * The platform's command modifier (Cmd on Apple, Ctrl elsewhere) plus `key`.
 * One modifier per platform: Ctrl+K on a Mac is the text fields' kill-line
 * (Emacs keys), and Win+K elsewhere is the OS's own Cast panel. Alt narrows,
 * and so does Shift unless the chord asks for it (Ctrl+S and Ctrl+Shift+S are
 * two different chords).
 */
export function isModChord(
  event: ChordEvent,
  apple: boolean,
  key: string,
  options: { shift?: boolean } = {}
): boolean {
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey !== (options.shift ?? false)) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

/** A modifier chord as the pilot's own keyboard labels it: `⌘S` / `Ctrl S`, `⇧⌘S` / `Ctrl Shift S`. */
export function modChordDisplayKey(
  apple: boolean,
  key: string,
  options: { shift?: boolean } = {}
): string {
  if (apple) return `${options.shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl ${options.shift ? 'Shift ' : ''}${key}`;
}

/** The chord as the pilot's own keyboard labels it. */
export function commandPaletteDisplayKey(apple: boolean): string {
  return modChordDisplayKey(apple, 'K');
}

/** The page-level paste chord the app-wide paste router listens for. */
export function pasteDisplayKey(apple: boolean): string {
  return apple ? '⌘V' : 'Ctrl V';
}

/** macOS, iOS and iPadOS, where the chord is Cmd rather than Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

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
 * `app/useKeyboardShortcuts.ts` (dispatch) and `features/help/ShortcutsPanel.tsx`
 * (discoverability list). Adding a shortcut is a data change here, not a new
 * `addEventListener` call anywhere.
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'switch-character',
    key: 'c',
    displayKey: 'C',
    descriptionKey: 'shortcuts.switchCharacter',
    run: (navigate) => navigate('/characters'),
  },
  {
    id: 'go-to-overview',
    key: 'o',
    displayKey: 'O',
    descriptionKey: 'shortcuts.goToOverview',
    run: (navigate) => navigate('/overview'),
  },
  {
    id: 'go-to-market',
    key: 'm',
    displayKey: 'M',
    descriptionKey: 'shortcuts.goToMarket',
    run: (navigate) => navigate('/market'),
  },
  {
    id: 'go-to-industry',
    key: 'i',
    displayKey: 'I',
    descriptionKey: 'shortcuts.goToIndustry',
    run: (navigate) => navigate('/industry'),
  },
  {
    id: 'go-to-wallet',
    key: 'w',
    displayKey: 'W',
    descriptionKey: 'shortcuts.goToWallet',
    run: (navigate) => navigate('/wallet'),
  },
  {
    id: 'go-to-planetary-industry',
    key: 'p',
    displayKey: 'P',
    descriptionKey: 'shortcuts.goToPlanetaryIndustry',
    run: (navigate) => navigate('/planetary-industry'),
  },
  {
    id: 'go-to-alerts',
    key: 'a',
    displayKey: 'A',
    descriptionKey: 'shortcuts.goToAlerts',
    run: (navigate) => navigate('/alerts'),
  },
  {
    id: 'go-to-mining-tax',
    key: 't',
    displayKey: 'T',
    descriptionKey: 'shortcuts.goToMiningTax',
    run: (navigate) => navigate('/mining/tax'),
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
    // The list this opens is the one rendered from this very array, on
    // Help › Shortcuts.
    run: (navigate) => navigate('/help/shortcuts'),
  },
  {
    id: 'close',
    key: 'Escape',
    displayKey: 'Esc',
    descriptionKey: 'shortcuts.close',
  },
];
