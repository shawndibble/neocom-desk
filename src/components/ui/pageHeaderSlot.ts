import { createContext, useContext } from 'react';

export interface PageHeaderSlot {
  element: HTMLElement | null;
  register: (el: HTMLElement) => void;
  unregister: (el: HTMLElement) => void;
}

export const PageHeaderSlotContext = createContext<PageHeaderSlot>({
  element: null,
  register: () => undefined,
  unregister: () => undefined,
});

export const usePageHeaderSlot = () => useContext(PageHeaderSlotContext);
