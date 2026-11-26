import { createContext, type ReactNode } from 'react';

export type MenuKind = 'context' | 'dropdown';

export const MenuKindContext = createContext<MenuKind>('context');

export interface RowActions {
  name: string;
  items: ReactNode;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  modal?: boolean;
  openHref?: string;
}

export const RowActionsContext = createContext<RowActions | null>(null);

export const RowOpenHrefContext = createContext<string | undefined>(undefined);
