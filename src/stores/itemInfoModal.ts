import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export interface ItemInfoRequest {
  typeId: number;
  itemId?: number;
  itemName?: string;
}

interface ItemInfoModalState {
  request: ItemInfoRequest | null;
  staged: { typeId: number; itemName: string } | null;
  open: (typeId: number, itemName?: string, itemId?: number) => void;
  close: () => void;
  stage: (typeId: number, itemName?: string) => void;
  show: (request: ItemInfoRequest) => void;
  clear: () => void;
}

export const useItemInfoModalStore = create<ItemInfoModalState>((set, get) => ({
  request: null,
  staged: null,
  open: (typeId, itemName, itemId) => {
    const navigator = getEntityInfoNavigator();
    if (!navigator) {
      set({ request: { typeId, itemName, itemId } });
      return;
    }
    get().stage(typeId, itemName);
    navigator.open({ kind: 'type', id: typeId, itemId });
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

export function itemInfoIsUrlBacked(): boolean {
  return getEntityInfoNavigator() !== null;
}

export function openItemInfo(typeId: number, itemName?: string, itemId?: number): void {
  useItemInfoModalStore.getState().open(typeId, itemName, itemId);
}
