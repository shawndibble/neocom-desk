import { create } from 'zustand';
import type { PlanEntry } from '@/engine/types';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export interface SkillDetailRequest {
  typeID: number;
  planEntries?: readonly PlanEntry[];
}

export interface SkillDetailOpenOptions {
  planEntries?: readonly PlanEntry[];
}

interface SkillDetailModalState {
  request: SkillDetailRequest | null;
  staged: { typeID: number; planEntries: readonly PlanEntry[] } | null;
  open: (typeID: number, options?: SkillDetailOpenOptions) => void;
  close: () => void;
  stage: (typeID: number, planEntries?: readonly PlanEntry[]) => void;
  show: (request: SkillDetailRequest) => void;
  clear: () => void;
}

export const useSkillDetailModalStore = create<SkillDetailModalState>((set, get) => ({
  request: null,
  staged: null,
  open: (typeID, options) => {
    const navigator = getEntityInfoNavigator();
    if (!navigator) {
      set({ request: { typeID, planEntries: options?.planEntries } });
      return;
    }
    get().stage(typeID, options?.planEntries);
    navigator.open({ kind: 'skill', id: typeID });
  },
  close: () => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.close();
    else set({ request: null });
  },
  stage: (typeID, planEntries) => set({ staged: planEntries ? { typeID, planEntries } : null }),
  show: (request) => set({ request }),
  clear: () => set({ request: null, staged: null }),
}));

export function useSkillDetailModal(): {
  open: (typeID: number, options?: SkillDetailOpenOptions) => void;
} {
  const open = useSkillDetailModalStore((state) => state.open);
  return { open };
}

export function openSkillDetailModal(typeID: number, options?: SkillDetailOpenOptions): void {
  useSkillDetailModalStore.getState().open(typeID, options);
}
