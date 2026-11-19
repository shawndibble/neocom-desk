/**
 * Session-only signal for opening the shared `PublicInfoModal` from any
 * feature (Contacts, Corp Members, Contracts, …) without threading modal
 * state through each one. Same shape as `authFailure.ts`: a global store
 * holds the current request, and `PublicInfoModal` — mounted once in
 * `App.tsx` — renders it. See GLOSSARY.md rounds 49-50.
 */
import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export type PublicInfoKind = 'character' | 'corporation' | 'alliance' | 'faction';

export interface PublicInfoRequest {
  kind: PublicInfoKind;
  id: number;
}

interface PublicInfoModalState {
  request: PublicInfoRequest | null;
  /** The `infoTab` the URL names (`interactions`), or null for the modal's default tab. */
  tab: string | null;
  /** Moves the URL to `?info=<kind>-<id>` (`EntityInfoRoute` then shows it). */
  open: (kind: PublicInfoKind, id: number) => void;
  /** Takes `info` off the URL. */
  close: () => void;
  /** Opens a tab by moving `infoTab` on the URL, so Back from a page it linked to returns here. */
  setTab: (tab: string | null) => void;
  /** Raw setters for `EntityInfoRoute` and the modal's own cleanup: state only, no navigation. */
  show: (request: PublicInfoRequest) => void;
  showTab: (tab: string | null) => void;
  clear: () => void;
}

export const usePublicInfoModalStore = create<PublicInfoModalState>((set) => ({
  request: null,
  tab: null,
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
  setTab: (tab) => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.setTab(tab);
    else set({ tab });
  },
  show: (request) => set({ request }),
  showTab: (tab) => set({ tab }),
  clear: () => set({ request: null, tab: null }),
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
