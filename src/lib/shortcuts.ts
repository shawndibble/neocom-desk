import type { NavigateFunction } from 'react-router-dom';

/**
 * Router `location.state` shape the "jump to search" shortcut navigates
 * `/market` with. Shared so the producer here and the consumer in
 * `routes/Market.tsx` can't silently drift apart.
 */
export interface MarketFocusSearchState {
  readonly focusSearch: true;
}

export interface ShortcutDef {
  readonly id: string;
  /** Matches `KeyboardEvent.key` exactly; the listener only checks this with no modifier held. */
  readonly key: string;
  /** What the key looks like on screen — kept separate from `key` since `key` must match the DOM event verbatim ('Escape', not 'Esc'). */
  readonly displayKey: string;
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
    id: 'close',
    key: 'Escape',
    displayKey: 'Esc',
    descriptionKey: 'shortcuts.close',
  },
];
