/**
 * The Compare Set (CONTEXT.md): items the user is pricing against each other
 * right now, usually variants of one thing. Scratch state — unlike the
 * Quickbar it does not sync and does not survive a reload, so this is a plain
 * zustand store with no Dexie backing, local to this feature like `hub.ts`.
 */
import { create } from 'zustand';

export interface CompareSetItem {
  typeId: number;
  itemName: string;
}

interface CompareSetState {
  items: CompareSetItem[];
  add: (item: CompareSetItem) => void;
  remove: (typeId: number) => void;
  clear: () => void;
}

export const useCompareSet = create<CompareSetState>((set) => ({
  items: [],
  add: (item) =>
    set((state) =>
      state.items.some((existing) => existing.typeId === item.typeId)
        ? state
        : { items: [...state.items, item] }
    ),
  remove: (typeId) =>
    set((state) => ({ items: state.items.filter((item) => item.typeId !== typeId) })),
  clear: () => set({ items: [] }),
}));
