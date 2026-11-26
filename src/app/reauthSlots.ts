import { useEffect, useId, useMemo } from 'react';
import { create } from 'zustand';
import type { EsiEndpointId } from '@/esi/registry';

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
  primary: boolean;
  endpoints: readonly EsiEndpointId[];
  shared: boolean;
}

export function slotFor(slots: readonly Slot[], key: string): SlotView {
  const own = slots.find((s) => s.key === key);
  if (!own) return { primary: false, endpoints: [], shared: false };
  const peers = slots.filter((s) => s.characterId === own.characterId);
  const speaker = peers.reduce((best, s) => (WEIGHT[s.rank] > WEIGHT[best.rank] ? s : best));
  if (speaker.key !== key) return { primary: false, endpoints: [], shared: false };
  return {
    primary: true,
    endpoints: [...new Set(peers.flatMap((s) => s.endpoints))],
    shared: peers.length > 1,
  };
}

export function useSlotCovers(characterId: number | undefined): boolean {
  return useReauthSlots((state) => state.slots.some((s) => s.characterId === characterId));
}

export function useReauthSlot(
  characterId: number,
  rank: SlotRank,
  endpoints: readonly EsiEndpointId[]
): SlotView {
  const key = useId();
  const endpointsKey = endpoints.join(',');
  useEffect(() => () => useReauthSlots.getState().release(key), [key, characterId]);
  useEffect(() => {
    useReauthSlots.getState().claim(key, characterId, rank, splitKey(endpointsKey));
  }, [key, characterId, rank, endpointsKey]);
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
