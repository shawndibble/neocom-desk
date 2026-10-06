/**
 * Session-only signal for opening the app-wide Item Detail (Show info) from
 * any item name — same shape as `skillDetailModal.ts`. `ItemInfoModal`,
 * mounted once in `App.tsx`, renders the request; `EntityInfoRoute` keeps it
 * in step with the URL's `?info=type-<typeId>`.
 */
import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export interface ItemInfoRequest {
  typeId: number;
  /** Absent when the URL was opened cold; the host then looks the name up. */
  itemName?: string;
}

interface ItemInfoModalState {
  request: ItemInfoRequest | null;
  /** A link click's name: the URL carries the type but not what it is called. */
  staged: { typeId: number; itemName: string } | null;
  /** Moves the URL to `?info=type-<typeId>` (`EntityInfoRoute` then shows it). */
  open: (typeId: number, itemName?: string) => void;
  /** Takes `info` off the URL. */
  close: () => void;
  stage: (typeId: number, itemName?: string) => void;
  /** Raw setters for `EntityInfoRoute`: state only, no navigation. */
  show: (request: ItemInfoRequest) => void;
  clear: () => void;
}

export const useItemInfoModalStore = create<ItemInfoModalState>((set, get) => ({
  request: null,
  staged: null,
  open: (typeId, itemName) => {
    const navigator = getEntityInfoNavigator();
    if (!navigator) {
      set({ request: { typeId, itemName } });
      return;
    }
    get().stage(typeId, itemName);
    navigator.open({ kind: 'type', id: typeId });
  },
  close: () => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.close();
    else set({ request: null });
  },
  stage: (typeId, itemName) => set({ staged: itemName ? { typeId, itemName } : null }),
  show: (request) => set({ request }),
  clear: () => set({ request: null, staged: null }),
}));

/** True once the app shell's `EntityInfoRoute` is mounted, i.e. `open` will move the URL. */
export function itemInfoIsUrlBacked(): boolean {
  return getEntityInfoNavigator() !== null;
}

/** Direct call for event handlers and menus outside render. */
export function openItemInfo(typeId: number, itemName?: string): void {
  useItemInfoModalStore.getState().open(typeId, itemName);
}
