/**
 * Session-only signal for opening the shared `SkillDetailModal` from any
 * feature that renders a skill name (Skills, Skill Plan Editor, …) without
 * threading modal state through each one. Same shape as `publicInfoModal.ts`:
 * a global store holds the current request, and `SkillDetailModal` — mounted
 * once in `App.tsx` — renders it. See CONTEXT.md round 49.
 */
import { create } from 'zustand';
import type { PlanEntry } from '@/engine/types';
import { getEntityInfoNavigator } from './entityInfoNavigator';

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
  /**
   * The plan entries a link click is about to open a skill with. The URL can
   * carry the skill but not the entries, so they wait here until
   * `EntityInfoRoute` shows the modal.
   */
  staged: { typeID: number; planEntries: readonly PlanEntry[] } | null;
  /** Moves the URL to `?info=skill-<typeID>` (`EntityInfoRoute` then shows it). */
  open: (typeID: number, options?: SkillDetailOpenOptions) => void;
  /** Takes `info` off the URL. */
  close: () => void;
  /** For a `SkillLink` click: the link itself navigates, this only carries the plan along. */
  stage: (typeID: number, planEntries?: readonly PlanEntry[]) => void;
  /** Raw setters for `EntityInfoRoute` and the modal's own cleanup: state only, no navigation. */
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
