import { useEffect, useId, useMemo } from 'react';
import { create } from 'zustand';
import type { EsiEndpointId } from '@/esi/registry';

/**
 * The re-login banners on screen, so a page shows one per Character rather
 * than one per panel (the Overview's widgets, a page's sections), and the
 * shell's notice stands down while a page banner already covers that
 * Character. The first banner mounted for a Character speaks, and its one
 * login asks for every endpoint the others needed too.
 */
interface Slot {
  key: string;
  characterId: number;
  endpoints: readonly EsiEndpointId[];
}

interface ReauthSlots {
  slots: readonly Slot[];
  claim: (key: string, characterId: number, endpoints: readonly EsiEndpointId[]) => void;
  release: (key: string) => void;
  /** Whether a banner on screen already covers `characterId`. */
  covers: (characterId: number) => boolean;
}

export const useReauthSlots = create<ReauthSlots>((set, get) => ({
  slots: [],
  claim: (key, characterId, endpoints) =>
    set((state) => {
      const at = state.slots.findIndex((s) => s.key === key);
      const slot = { key, characterId, endpoints };
      if (at === -1) return { slots: [...state.slots, slot] };
      return { slots: state.slots.map((s, i) => (i === at ? slot : s)) };
    }),
  release: (key) => set((state) => ({ slots: state.slots.filter((s) => s.key !== key) })),
  covers: (characterId) => get().slots.some((s) => s.characterId === characterId),
}));

export interface SlotView {
  /** Whether this banner is the one that speaks for its Character. */
  primary: boolean;
  /** For the primary banner: every endpoint its Character's banners need, once each. */
  endpoints: readonly EsiEndpointId[];
}

export function slotFor(slots: readonly Slot[], key: string): SlotView {
  const own = slots.find((s) => s.key === key);
  if (!own) return { primary: false, endpoints: [] };
  const peers = slots.filter((s) => s.characterId === own.characterId);
  if (peers[0]?.key !== key) return { primary: false, endpoints: [] };
  return { primary: true, endpoints: [...new Set(peers.flatMap((s) => s.endpoints))] };
}

/** Claims a slot while mounted; the answer for this banner. */
export function useReauthSlot(characterId: number, endpoints: readonly EsiEndpointId[]): SlotView {
  const key = useId();
  // Keyed by value: callers may rebuild the array every render.
  const endpointsKey = endpoints.join(',');
  useEffect(() => {
    useReauthSlots.getState().claim(key, characterId, splitKey(endpointsKey));
    return () => useReauthSlots.getState().release(key);
  }, [key, characterId, endpointsKey]);
  // Plain values out of the selector: an object or array built inside it is new every call,
  // which the store's subscription reads as a change, forever.
  const primary = useReauthSlots((state) => slotFor(state.slots, key).primary);
  const allKey = useReauthSlots((state) => slotFor(state.slots, key).endpoints.join(','));
  return useMemo(() => ({ primary, endpoints: splitKey(allKey) }), [primary, allKey]);
}

function splitKey(key: string): EsiEndpointId[] {
  return key === '' ? [] : (key.split(',') as EsiEndpointId[]);
}
