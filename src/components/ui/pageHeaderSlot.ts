import { createContext, useContext } from 'react';

export interface PageHeaderSlot {
  /** The newest mounted header's slot element; null on a page without a `PageHeader`. */
  element: HTMLElement | null;
  /** A header registers its slot element on mount and unregisters it on unmount. */
  register: (el: HTMLElement) => void;
  unregister: (el: HTMLElement) => void;
}

export const PageHeaderSlotContext = createContext<PageHeaderSlot>({
  element: null,
  register: () => undefined,
  unregister: () => undefined,
});

export const usePageHeaderSlot = () => useContext(PageHeaderSlotContext);
