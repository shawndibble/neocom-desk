/**
 * Session-only signal for opening the shared `SkillDetailModal` from any
 * feature that renders a skill name (Skills, Skill Plan Editor, …) without
 * threading modal state through each one. Same shape as `publicInfoModal.ts`:
 * a global store holds the current request, and `SkillDetailModal` — mounted
 * once in `App.tsx` — renders it. See CONTEXT.md round 49.
 */
import { create } from 'zustand';

export interface SkillDetailRequest {
  typeID: number;
}

interface SkillDetailModalState {
  request: SkillDetailRequest | null;
  open: (typeID: number) => void;
  close: () => void;
}

export const useSkillDetailModalStore = create<SkillDetailModalState>((set) => ({
  request: null,
  open: (typeID) => set({ request: { typeID } }),
  close: () => set({ request: null }),
}));

/** Hook for call sites inside a component: `const { open } = useSkillDetailModal();` */
export function useSkillDetailModal(): { open: (typeID: number) => void } {
  const open = useSkillDetailModalStore((state) => state.open);
  return { open };
}

/** Direct call for non-React call sites (event handlers already outside render). */
export function openSkillDetailModal(typeID: number): void {
  useSkillDetailModalStore.getState().open(typeID);
}
