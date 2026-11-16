import { useEffect, useId, useMemo } from 'react';
import { create } from 'zustand';
import type { EsiEndpointId } from '@/esi/registry';

/**
 * The re-login banners on screen, so a page shows one per Character rather
 * than one per panel (the Overview's widgets, a page's sections), and the
 * shell's notice stands down while a page banner already covers that
 * Character. The weightiest banner for a Character speaks (a locked page over
 * a full banner over a one-line note), the earliest among equals, and its one
 * login asks for every endpoint the others needed too.
 *
 * Only banners for data that cannot load take part. A note on a figure that
 * merely assumes something ("Assumes base standings") always shows on its own:
 * it must never stand in for, or silence, a real re-login.
 */

/** How much a banner weighs: a locked page, a full banner, a one-line note beside saved data. */
export type SlotRank = 'page' | 'banner' | 'note';

const WEIGHT: Record<SlotRank, number> = { page: 3, banner: 2, note: 1 };

interface Slot {
  key: string;
  characterId: number;
  rank: SlotRank;
  endpoints: readonly EsiEndpointId[];
}

interface ReauthSlots {
  slots: readonly Slot[];
  /** Adds the slot, or updates it in place: a banner keeps its turn when its endpoints change. */
  claim: (
    key: string,
    characterId: number,
    rank: SlotRank,
    endpoints: readonly EsiEndpointId[]
  ) => void;
  release: (key: string) => void;
}

export const useReauthSlots = create<ReauthSlots>((set) => ({
  slots: [],
  claim: (key, characterId, rank, endpoints) =>
    set((state) => {
      const slot = { key, characterId, rank, endpoints };
      const at = state.slots.findIndex((s) => s.key === key);
      if (at === -1) return { slots: [...state.slots, slot] };
      return { slots: state.slots.map((s, i) => (i === at ? slot : s)) };
    }),
  release: (key) => set((state) => ({ slots: state.slots.filter((s) => s.key !== key) })),
}));

export interface SlotView {
  /** Whether this banner is the one that speaks for its Character. */
  primary: boolean;
  /** For the primary banner: every endpoint its Character's banners need, once each. */
  endpoints: readonly EsiEndpointId[];
  /** Whether it speaks for other banners too, so its own context line would mislead. */
  shared: boolean;
}

export function slotFor(slots: readonly Slot[], key: string): SlotView {
  const own = slots.find((s) => s.key === key);
  if (!own) return { primary: false, endpoints: [], shared: false };
  const peers = slots.filter((s) => s.characterId === own.characterId);
  // The weightiest, then the earliest: `reduce` keeps the first of equals.
  const speaker = peers.reduce((best, s) => (WEIGHT[s.rank] > WEIGHT[best.rank] ? s : best));
  if (speaker.key !== key) return { primary: false, endpoints: [], shared: false };
  return {
    primary: true,
    endpoints: [...new Set(peers.flatMap((s) => s.endpoints))],
    shared: peers.length > 1,
  };
}

/** Whether a banner on screen speaks for `characterId`, for the shell notice to stand down. */
export function useSlotCovers(characterId: number | undefined): boolean {
  return useReauthSlots((state) => state.slots.some((s) => s.characterId === characterId));
}

/** Claims a slot while mounted; the answer for this banner. */
export function useReauthSlot(
  characterId: number,
  rank: SlotRank,
  endpoints: readonly EsiEndpointId[]
): SlotView {
  const key = useId();
  // Keyed by value: callers may rebuild the array every render.
  const endpointsKey = endpoints.join(',');
  // Released only on unmount or a new Character; an endpoint change updates in place.
  useEffect(() => () => useReauthSlots.getState().release(key), [key, characterId]);
  useEffect(() => {
    useReauthSlots.getState().claim(key, characterId, rank, splitKey(endpointsKey));
  }, [key, characterId, rank, endpointsKey]);
  // Plain values out of the selector: an object or array built inside it is new every call,
  // which the store's subscription reads as a change, forever.
  const primary = useReauthSlots((state) => slotFor(state.slots, key).primary);
  const allKey = useReauthSlots((state) => slotFor(state.slots, key).endpoints.join(','));
  const shared = useReauthSlots((state) => slotFor(state.slots, key).shared);
  return useMemo(
    () => ({ primary, endpoints: splitKey(allKey), shared }),
    [primary, allKey, shared]
  );
}

function splitKey(key: string): EsiEndpointId[] {
  return key === '' ? [] : (key.split(',') as EsiEndpointId[]);
}
