import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export interface PlaceInfoRequest {
  id: number;
}

interface PlaceInfoModalState {
  request: PlaceInfoRequest | null;
  open: (id: number) => void;
  close: () => void;
  show: (request: PlaceInfoRequest) => void;
  clear: () => void;
}

export const usePlaceInfoModalStore = create<PlaceInfoModalState>((set) => ({
  request: null,
  open: (id) => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.open({ kind: 'place', id });
    else set({ request: { id } });
  },
  close: () => {
    const navigator = getEntityInfoNavigator();
    if (navigator) navigator.close();
    else set({ request: null });
  },
  show: (request) => set({ request }),
  clear: () => set({ request: null }),
}));
