// Session cache of public character info (corp/alliance names) keyed by
// character ID. The fetches go through the esiCache-backed loaders in
// `features/character/publicInfoData.ts` and `names.ts`, so a cold start
// offline still shows the names last seen; the store itself stays in memory.
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
  /** Ids behind the names, so a name can be an entity link. Absent on entries built without them. */
  corporationId?: number;
  allianceId?: number;
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

/**
 * One character's corp/alliance names through the cached loaders, or null when
 * any of them is unavailable (offline and never seen) — a half-known entry is
 * not stored, so the next visit retries instead of pinning "—".
 */
async function loadEntry(characterId: number): Promise<PublicInfoEntry | null> {
  // Short window, not the long static one: this response is what notices a
  // corporation change (below), so online it must be read live, not up to a
  // day late. Corp and alliance names change almost never and keep the long one.
  const info = await loadPublicCharacterInfo(characterId, { staleAfterMs: STALE_AFTER.default });
  if (!info) return null;
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
      // Dexie or ESI failure: cache nothing so a later visit retries; UI shows "—".
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
      const nameById = await resolveNames([...corpAndAllianceIds]);
      set((state) => {
        const byCharacterId = { ...state.byCharacterId };
        for (const affiliation of affiliations) {
          const corporationName = nameById.get(affiliation.corporation_id);
          const allianceName =
            affiliation.alliance_id === undefined ? null : nameById.get(affiliation.alliance_id);
          // A name that couldn't be resolved (offline, never seen) stores
          // nothing, so a later visit retries instead of pinning "—".
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
      // The batched affiliation POST is not cached, so offline it fails: fall
      // back to each character's cached record. Whatever is still unknown
      // caches nothing, so a later visit retries; UI shows "—".
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
