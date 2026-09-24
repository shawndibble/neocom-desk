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
}

/**
 * Published by a row's menu wrapper. React context follows render position,
 * not DOM position, so a `<tr>` handed into the wrapper as its trigger still
 * sees it — and so does a sibling the wrapper renders beside its trigger.
 */
export const RowActionsContext = createContext<RowActions | null>(null);
