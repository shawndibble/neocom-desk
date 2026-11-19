import { createContext, useContext } from 'react';

export interface PageHeaderSlot {
  /** The header's slot element, once a `PageHeader` has mounted; null on a page without one. */
  element: HTMLElement | null;
  setElement: (el: HTMLElement | null) => void;
}

export const PageHeaderSlotContext = createContext<PageHeaderSlot>({
  element: null,
  setElement: () => undefined,
});

export const usePageHeaderSlot = () => useContext(PageHeaderSlotContext);
