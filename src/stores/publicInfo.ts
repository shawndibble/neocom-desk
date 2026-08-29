// Session cache of public character info (corp/alliance names) keyed by
// character ID. Thin by design: durable API caching is a later milestone.
import { create } from 'zustand';
import {
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
} from '@/esi/endpoints';

export interface PublicInfoEntry {
  corporationName: string | null;
  allianceName: string | null;
}

interface PublicInfoState {
  byCharacterId: Record<number, PublicInfoEntry>;
  /** Fetch + cache corp/alliance names. No-op when cached or in flight; swallows failures (offline). */
  load: (characterId: number) => Promise<void>;
}

const inflight = new Set<number>();

export const usePublicInfo = create<PublicInfoState>((set, get) => ({
  byCharacterId: {},
  load: async (characterId) => {
    if (get().byCharacterId[characterId] || inflight.has(characterId)) return;
    inflight.add(characterId);
    try {
      const info = (await getCharacterPublicInfo(characterId)).data;
      if (!info) return;
      const corporationName =
        (await getCorporationPublicInfo(info.corporation_id)).data?.name ?? null;
      const allianceName =
        info.alliance_id === undefined
          ? null
          : ((await getAlliancePublicInfo(info.alliance_id)).data?.name ?? null);
      set((state) => ({
        byCharacterId: {
          ...state.byCharacterId,
          [characterId]: { corporationName, allianceName },
        },
      }));
    } catch {
      // Offline or ESI down: cache nothing so a later visit retries; UI shows "—".
    } finally {
      inflight.delete(characterId);
    }
  },
}));
