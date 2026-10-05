/**
 * Session-only signal for opening the shared `PublicInfoModal` from any
 * feature (Contacts, Corp Members, Contracts, …) without threading modal
 * state through each one. Same shape as `authFailure.ts`: a global store
 * holds the current request, and `PublicInfoModal` — mounted once in
 * `App.tsx` — renders it. See CONTEXT.md rounds 49-50.
 */
import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export type PublicInfoKind = 'character' | 'corporation' | 'alliance';

export interface PublicInfoRequest {
  kind: PublicInfoKind;
  id: number;
}

interface PublicInfoModalState {
  request: PublicInfoRequest | null;
  /** Moves the URL to `?info=<kind>-<id>` (`EntityInfoRoute` then shows it). */
  open: (kind: PublicInfoKind, id: number) => void;
  /** Takes `info` off the URL. */
  close: () => void;
  /** Raw setters for `EntityInfoRoute` and the modal's own cleanup: state only, no navigation. */
  show: (request: PublicInfoRequest) => void;
  clear: () => void;
}

export const usePublicInfoModalStore = create<PublicInfoModalState>((set) => ({
  request: null,
  open: (kind, id) => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.open({ kind, id });
    else set({ request: { kind, id } });
  },
  close: () => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.close();
    else set({ request: null });
  },
  show: (request) => set({ request }),
  clear: () => set({ request: null }),
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
