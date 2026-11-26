import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export type PublicInfoKind = 'character' | 'corporation' | 'alliance' | 'faction';

export interface PublicInfoRequest {
  kind: PublicInfoKind;
  id: number;
}

interface PublicInfoModalState {
  request: PublicInfoRequest | null;
  tab: string | null;
  open: (kind: PublicInfoKind, id: number) => void;
  close: () => void;
  setTab: (tab: string | null) => void;
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

export function usePublicInfoModal(): { open: (kind: PublicInfoKind, id: number) => void } {
  const open = usePublicInfoModalStore((state) => state.open);
  return { open };
}

export function openPublicInfoModal(kind: PublicInfoKind, id: number): void {
  usePublicInfoModalStore.getState().open(kind, id);
}
