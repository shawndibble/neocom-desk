import { createContext, type ReactNode } from 'react';

export type MenuKind = 'context' | 'dropdown';

/** Which Radix menu family the items below are rendering into. */
export const MenuKindContext = createContext<MenuKind>('context');

export interface RowActions {
  /** What the row is, for the button's accessible name ("More actions for {name}"). */
  name: string;
  /** The menu's items, built from `MenuItem`/`MenuSub*`. */
  items: ReactNode;
  onOpenChange?: (open: boolean) => void;
  /** Runs as either menu closes; `useOpenAfterMenu` hands its handler here so an item can open a dialog after focus is back on ⋮. */
  onCloseAutoFocus?: (event: Event) => void;
  /** `false` keeps the page scrollable and the scrollbar in place while either menu is open (the landing page's demo). */
  modal?: boolean;
  /** Where a click on the row goes, when that is another page: both menus lead with an "Open in new tab" link to it. */
  openHref?: string;
}

/**
 * Published by a row's menu wrapper. React context follows render position,
 * not DOM position, so a `<tr>` handed into the wrapper as its trigger still
 * sees it — and so does a sibling the wrapper renders beside its trigger.
 */
export const RowActionsContext = createContext<RowActions | null>(null);

/**
 * Items a surrounding table appends to every row menu under it — DataTable's
 * "Export table" submenu (`TableExport.tsx`). Kept here rather than imported
 * by `RowActions.tsx`, so the row menu needn't know what the table adds.
 */
export const RowMenuExtrasContext = createContext<ReactNode>(null);

/**
 * The page a click on the current `DataTable` row navigates to (its `rowHref`).
 * A `RowActionsMenu` under it picks the href up as its `openHref`.
 */
export const RowOpenHrefContext = createContext<string | undefined>(undefined);
