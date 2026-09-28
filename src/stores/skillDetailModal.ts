/**
 * Session-only signal for opening the shared `SkillDetailModal` from any
 * feature that renders a skill name (Skills, Skill Plan Editor, …) without
 * threading modal state through each one. Same shape as `publicInfoModal.ts`:
 * a global store holds the current request, and `SkillDetailModal` — mounted
 * once in `App.tsx` — renders it. See CONTEXT.md round 49.
 */
import { create } from 'zustand';
import type { PlanEntry } from '@/engine/types';

export interface SkillDetailRequest {
  typeID: number;
  /**
   * The Skill Plan Editor's own (possibly unsaved) entries, so a prereq
   * already staged in the plan being edited shows "Planned" rather than
   * "Level needed" — omitted by callers with no open plan (e.g. the Skills
   * page), where every prereq reads trained-or-needed only.
   */
  planEntries?: readonly PlanEntry[];
}

export interface SkillDetailOpenOptions {
  planEntries?: readonly PlanEntry[];
}

interface SkillDetailModalState {
  request: SkillDetailRequest | null;
  open: (typeID: number, options?: SkillDetailOpenOptions) => void;
  close: () => void;
}

export const useSkillDetailModalStore = create<SkillDetailModalState>((set) => ({
  request: null,
  open: (typeID, options) => set({ request: { typeID, planEntries: options?.planEntries } }),
  close: () => set({ request: null }),
}));

/** Hook for call sites inside a component: `const { open } = useSkillDetailModal();` */
export function useSkillDetailModal(): {
  open: (typeID: number, options?: SkillDetailOpenOptions) => void;
} {
  const open = useSkillDetailModalStore((state) => state.open);
  return { open };
}

/** Direct call for non-React call sites (event handlers already outside render). */
export function openSkillDetailModal(typeID: number, options?: SkillDetailOpenOptions): void {
  useSkillDetailModalStore.getState().open(typeID, options);
}
