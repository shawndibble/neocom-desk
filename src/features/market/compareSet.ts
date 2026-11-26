import { create } from 'zustand';

export interface CompareSetItem {
  typeId: number;
  itemName: string;
}

export type CompareView = 'prices' | 'hubs' | 'attributes';

interface CompareSetState {
  items: CompareSetItem[];
  view: CompareView;
  openRequest: number;
  add: (item: CompareSetItem) => void;
  addMany: (items: readonly CompareSetItem[]) => number[];
  remove: (typeId: number) => void;
  removeMany: (typeIds: readonly number[]) => void;
  clear: () => void;
  setView: (view: CompareView) => void;
  openIn: (view: CompareView) => void;
  consumeOpenRequest: () => void;
}

const EMPTY_SET_DEFAULTS = { view: 'prices' as const, openRequest: 0 };

export const useCompareSet = create<CompareSetState>((set, get) => ({
  items: [],
  ...EMPTY_SET_DEFAULTS,
  add: (item) =>
    set((state) =>
      state.items.some((existing) => existing.typeId === item.typeId)
        ? state
        : { items: [...state.items, item] }
    ),
  addMany: (items) => {
    const seen = new Set(get().items.map((item) => item.typeId));
    const additions: CompareSetItem[] = [];
    for (const item of items) {
      if (seen.has(item.typeId)) continue;
      seen.add(item.typeId);
      additions.push(item);
    }
    if (additions.length > 0) set((state) => ({ items: [...state.items, ...additions] }));
    return additions.map((item) => item.typeId);
  },
  remove: (typeId) =>
    set((state) => {
      const items = state.items.filter((item) => item.typeId !== typeId);
      return items.length === 0 ? { items, ...EMPTY_SET_DEFAULTS } : { items };
    }),
  removeMany: (typeIds) =>
    set((state) => {
      const drop = new Set(typeIds);
      const items = state.items.filter((item) => !drop.has(item.typeId));
      return items.length === 0 ? { items, ...EMPTY_SET_DEFAULTS } : { items };
    }),
  clear: () => set({ items: [], ...EMPTY_SET_DEFAULTS }),
  setView: (view) => set({ view }),
  openIn: (view) => set((state) => ({ view, openRequest: state.openRequest + 1 })),
  consumeOpenRequest: () => set({ openRequest: 0 }),
}));
