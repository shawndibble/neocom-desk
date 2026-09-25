/**
 * The Compare Set (CONTEXT.md): items the user is pricing against each other
 * right now, usually variants of one thing. Scratch state — unlike the
 * Quickbar it does not sync and does not survive a reload, so this is a plain
 * zustand store with no Dexie backing, local to this feature like `hub.ts`.
 *
 * `view`/`openRequest` (issue #1425): the drawer's Prices/Attributes switch
 * and the signal that a caller (Variations "Compare") wants the drawer open
 * on a given view, not just the items in it. `openRequest` is a counter
 * rather than a boolean so two `openIn` calls in a row (e.g. two different
 * variation groups) each produce a distinct, effect-observable change even
 * if the view doesn't change between them. `remove`/`clear` reset both back
 * to their defaults whenever they empty the set — the drawer unmounts at
 * that point (`compareCount > 0` in Market.tsx) and discards its own
 * open/height state for free, so a stale `openRequest` surviving in the
 * store would otherwise wrongly force the *next* mount open even when it
 * was reached via a plain "Add to Compare", not a fresh `openIn`. For the
 * same reason the drawer calls `consumeOpenRequest` once it has acted on a
 * request: the store outlives the Market route, so an already-honoured
 * request left in place would reopen the drawer every time the route
 * remounts it.
 */
import { create } from 'zustand';

export interface CompareSetItem {
  typeId: number;
  itemName: string;
}

export type CompareView = 'prices' | 'attributes';

interface CompareSetState {
  items: CompareSetItem[];
  view: CompareView;
  openRequest: number;
  add: (item: CompareSetItem) => void;
  /** Returns the typeIds actually added (not already in the set), for an Undo. */
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
