/**
 * Session-only signal for the app-wide Place Info (a region, station or
 * structure) — same shape as `itemInfoModal.ts`. `PlaceInfoModal`, mounted
 * once in `App.tsx`, renders the request; `EntityInfoRoute` keeps it in step
 * with the URL's `?info=place-<id>`.
 */
import { create } from 'zustand';
import { getEntityInfoNavigator } from './entityInfoNavigator';

export interface PlaceInfoRequest {
  /** A region, NPC station or Upwell structure id. */
  id: number;
}

interface PlaceInfoModalState {
  request: PlaceInfoRequest | null;
  /** Moves the URL to `?info=place-<id>` (`EntityInfoRoute` then shows it). */
  open: (id: number) => void;
  /** Takes `info` off the URL. */
  close: () => void;
  /** Raw setters for `EntityInfoRoute`: state only, no navigation. */
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
