/**
 * Session-only signal for opening the shared `PublicInfoModal` from any
 * feature (Contacts, Corp Members, Contracts, …) without threading modal
 * state through each one. Same shape as `authFailure.ts`: a global store
 * holds the current request, and `PublicInfoModal` — mounted once in
 * `App.tsx` — renders it. See CONTEXT.md rounds 49-50.
 */
import { create } from 'zustand';

export type PublicInfoKind = 'character' | 'corporation' | 'alliance';

export interface PublicInfoRequest {
  kind: PublicInfoKind;
  id: number;
}

interface PublicInfoModalState {
  request: PublicInfoRequest | null;
  open: (kind: PublicInfoKind, id: number) => void;
  close: () => void;
}

export const usePublicInfoModalStore = create<PublicInfoModalState>((set) => ({
  request: null,
  open: (kind, id) => set({ request: { kind, id } }),
  close: () => set({ request: null }),
}));

/** Hook for call sites inside a component: `const { open } = usePublicInfoModal();` */
export function usePublicInfoModal(): { open: (kind: PublicInfoKind, id: number) => void } {
  const open = usePublicInfoModalStore((state) => state.open);
  return { open };
}

/** Direct call for non-React call sites (event handlers already outside render). */
export function openPublicInfoModal(kind: PublicInfoKind, id: number): void {
  usePublicInfoModalStore.getState().open(kind, id);
}
