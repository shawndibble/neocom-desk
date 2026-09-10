// Session cache of public character info (corp/alliance names) keyed by
// character ID. Thin by design: durable API caching is a later milestone.
import { create } from 'zustand';
import {
  getCharacterPublicInfo,
  getCorporationPublicInfo,
  getAlliancePublicInfo,
  postCharactersAffiliation,
  postUniverseNames,
} from '@/esi/endpoints';
import { recordCharacterCorporation } from '@/auth/session';

export interface PublicInfoEntry {
  corporationName: string | null;
  allianceName: string | null;
}

interface PublicInfoState {
  byCharacterId: Record<number, PublicInfoEntry>;
  /** Fetch + cache corp/alliance names. No-op when cached or in flight; swallows failures (offline). */
  load: (characterId: number) => Promise<void>;
  /**
   * Same as `load`, batched across many characters in (at most) two ESI
   * calls instead of up to three per character — `postCharactersAffiliation`
   * for every character's corp/alliance id, then one `postUniverseNames` for
   * every unique id that came back. A roster page calling `load` once per
   * character was the N+1 in issue reports (`/characters` firing a GET per
   * character plus a duplicate, undeduped GET per shared corp/alliance).
   * No-op for ids already cached or in flight (shared `inflight` set with
   * `load`, so the two never double-fetch the same character); swallows
   * failures the same way `load` does.
   */
  loadMany: (characterIds: readonly number[]) => Promise<void>;
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
      // This response is the app's only source for which corporation a
      // character is in — the SSO JWT carries no such claim — so it is also
      // the only place a corp *change* can be noticed and the old corp's
      // cached rows dropped (issue #293). Its own failure is not this store's
      // to report: the names below are what the view is waiting for.
      try {
        await recordCharacterCorporation(characterId, info.corporation_id);
      } catch {
        // Dexie unavailable: re-learned on the next public-info read.
      }
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
  loadMany: async (characterIds) => {
    const cached = get().byCharacterId;
    const toFetch = [...new Set(characterIds)].filter(
      (characterId) => !cached[characterId] && !inflight.has(characterId)
    );
    if (toFetch.length === 0) return;
    for (const characterId of toFetch) inflight.add(characterId);
    try {
      const affiliations = await postCharactersAffiliation(toFetch);
      // Same corp-change bookkeeping as `load` (issue #293) — each
      // character's own failure here isn't this store's to report.
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
      const names = await postUniverseNames([...corpAndAllianceIds]);
      const nameById = new Map(names.map((name) => [name.id, name.name]));
      set((state) => {
        const byCharacterId = { ...state.byCharacterId };
        for (const affiliation of affiliations) {
          byCharacterId[affiliation.character_id] = {
            corporationName: nameById.get(affiliation.corporation_id) ?? null,
            allianceName:
              affiliation.alliance_id === undefined
                ? null
                : (nameById.get(affiliation.alliance_id) ?? null),
          };
        }
        return { byCharacterId };
      });
    } catch {
      // Offline or ESI down: cache nothing so a later visit retries; UI shows "—".
    } finally {
      for (const characterId of toFetch) inflight.delete(characterId);
    }
  },
}));
