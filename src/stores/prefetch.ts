// Session-only progress of the boot-time cache warm-up (`app/prefetch.ts`), so
// the shell can show one indicator for it beside the sync dot instead of every
// view guessing whether its data is still on the way.
//
// Deliberately NOT persisted (mirrors `authFailure.ts` and `publicInfo.ts`):
// progress describes a run, and a reload starts a new one. What the run
// *produced* is durable — that lives in the Dexie `esiCache` table.
import { create } from 'zustand';

interface PrefetchState {
  /** Tasks the current run will attempt. 0 when no run has started. */
  total: number;
  /** Tasks the current run has settled — succeeded or failed alike. */
  completed: number;
  begin: (total: number) => void;
  advance: () => void;
  /**
   * Ends the run, whatever its outcome. Zeroing rather than leaving
   * `completed === total` keeps `isPrefetching` a single comparison and makes
   * an abandoned run (character switched mid-flight) indistinguishable from a
   * finished one — which is right, because neither is still in progress.
   */
  finish: () => void;
}

export const usePrefetch = create<PrefetchState>((set) => ({
  total: 0,
  completed: 0,
  begin: (total) => {
    set({ total, completed: 0 });
  },
  advance: () => {
    set((state) => ({ completed: state.completed + 1 }));
  },
  finish: () => {
    set({ total: 0, completed: 0 });
  },
}));

/** True while a warm-up run has tasks outstanding. */
export function isPrefetching(state: { total: number; completed: number }): boolean {
  return state.total > 0 && state.completed < state.total;
}
