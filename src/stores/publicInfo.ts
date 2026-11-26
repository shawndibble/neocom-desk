import { create } from 'zustand';
import { STALE_AFTER } from '@/esi/cache';
import { postCharactersAffiliation } from '@/esi/endpoints';
import { recordCharacterCorporation } from '@/auth/session';
import {
  loadPublicAllianceInfo,
  loadPublicCharacterInfo,
  loadPublicCorporationRecord,
} from '@/features/character/publicInfoData';
import { resolveNames } from '@/features/character/names';

export interface PublicInfoEntry {
  corporationName: string | null;
  allianceName: string | null;
  corporationId?: number;
  allianceId?: number;
}

interface PublicInfoState {
  byCharacterId: Record<number, PublicInfoEntry>;
  load: (characterId: number) => Promise<void>;
  loadMany: (characterIds: readonly number[]) => Promise<void>;
}

const inflight = new Set<number>();

async function loadEntry(characterId: number): Promise<PublicInfoEntry | null> {
  const info = await loadPublicCharacterInfo(characterId, { staleAfterMs: STALE_AFTER.default });
  if (!info) return null;
  try {
    await recordCharacterCorporation(characterId, info.corporation_id);
  } catch {}
  const corporation = await loadPublicCorporationRecord(info.corporation_id);
  if (!corporation) return null;
  let allianceName: string | null = null;
  if (info.alliance_id !== undefined) {
    const alliance = await loadPublicAllianceInfo(info.alliance_id);
    if (!alliance) return null;
    allianceName = alliance.name;
  }
  return {
    corporationName: corporation.name,
    allianceName,
    corporationId: info.corporation_id,
    allianceId: info.alliance_id,
  };
}

export const usePublicInfo = create<PublicInfoState>((set, get) => ({
  byCharacterId: {},
  load: async (characterId) => {
    if (get().byCharacterId[characterId] || inflight.has(characterId)) return;
    inflight.add(characterId);
    try {
      const entry = await loadEntry(characterId);
      if (!entry) return;
      set((state) => ({ byCharacterId: { ...state.byCharacterId, [characterId]: entry } }));
    } catch {
    } finally {
      inflight.delete(characterId);
    }
  },
  loadMany: async (characterIds) => {
    const cached = get().byCharacterId;
    const toFetch = [...new Set(characterIds)].filter(
      (characterId) => !cached[characterId] && !inflight.has(characterId)
    );
    if (toFetch.length === 0) return;
    for (const characterId of toFetch) inflight.add(characterId);
    try {
      const affiliations = await postCharactersAffiliation(toFetch);
      await Promise.all(
        affiliations.map((affiliation) =>
          recordCharacterCorporation(affiliation.character_id, affiliation.corporation_id).catch(
            () => {}
          )
        )
      );
      const corpAndAllianceIds = new Set<number>();
      for (const affiliation of affiliations) {
        corpAndAllianceIds.add(affiliation.corporation_id);
        if (affiliation.alliance_id !== undefined) corpAndAllianceIds.add(affiliation.alliance_id);
      }
      const nameById = await resolveNames([...corpAndAllianceIds]);
      set((state) => {
        const byCharacterId = { ...state.byCharacterId };
        for (const affiliation of affiliations) {
          const corporationName = nameById.get(affiliation.corporation_id);
          const allianceName =
            affiliation.alliance_id === undefined ? null : nameById.get(affiliation.alliance_id);
          if (corporationName === undefined || allianceName === undefined) continue;
          byCharacterId[affiliation.character_id] = {
            corporationName,
            corporationId: affiliation.corporation_id,
            allianceId: affiliation.alliance_id,
            allianceName,
          };
        }
        return { byCharacterId };
      });
    } catch {
      const entries = await Promise.all(toFetch.map((id) => loadEntry(id).catch(() => null)));
      set((state) => {
        const byCharacterId = { ...state.byCharacterId };
        toFetch.forEach((id, i) => {
          const entry = entries[i];
          if (entry) byCharacterId[id] = entry;
        });
        return { byCharacterId };
      });
    } finally {
      for (const characterId of toFetch) inflight.delete(characterId);
    }
  },
}));
