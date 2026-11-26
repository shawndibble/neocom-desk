import { create } from 'zustand';

interface PrefetchState {
  total: number;
  completed: number;
  begin: (total: number) => void;
  advance: () => void;
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

export function isPrefetching(state: { total: number; completed: number }): boolean {
  return state.total > 0 && state.completed < state.total;
}
