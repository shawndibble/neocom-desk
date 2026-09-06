/**
 * Fetch + cache layer for the Moon Mining Tax ledger (issue #523): every
 * tracked character's personal mining ledger (`GET /characters/{id}/mining/`),
 * grouped into Mining Ledger Entries via `engine/miningTax`. Default scope is
 * every tracked character, not the app's usual single-active-character
 * default (CONTEXT.md) — the point of the feature is not missing an alt's
 * obligation — so this fans out over `db.characters` the same way
 * `features/character/roster.ts` does, rather than reading the active
 * Character store.
 */
import { db, type CharacterRecord } from '@/db';
import { getCharacterMining } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { groupMiningLedger } from '@/engine/miningTax/groupLedger';
import type { MiningLedgerEntry, MiningLedgerRow } from '@/engine/miningTax/types';
import { loadMoonOreTypeIds, loadOreAndIceTypeIds } from '@/sde/loadSde';
import { loadManualIgnoredTypeIds, loadManualMoonOreTypeIds } from './typeOverrides';

export const KEYS = { ledger: 'miningTax:ledger' } as const;

/** One character's raw mining ledger. ESI or cache. */
export function loadMiningLedger(characterId: number): Promise<StatusResult<MiningLedgerRow[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEYS.ledger, () =>
    getCharacterMining(characterId)
  );
}

export interface CharacterMiningLedger {
  characterId: number;
  characterName: string;
  entries: MiningLedgerEntry[];
  /**
   * type_ids ESI reported that are neither moon ore nor a recognized ordinary
   * ore/ice — an allowlist gap (a stale SDE snapshot after a CCP patch), never
   * silently dropped (decision doc).
   */
  unclassifiedTypeIds: number[];
  /** 401/403 (or a failed refresh) on this character's ledger read. */
  needsReauth: boolean;
  fetchedAt: Date | null;
  fromCache: boolean;
}

/**
 * Every tracked character's Mining Ledger Entries at once. Cache-first per
 * character (same freshness window as every other ESI-backed view), fanned
 * out at `ESI_FANOUT_CONCURRENCY` like `roster.ts`'s live mode — one entry
 * per Character, never failing the whole read because one character's ledger
 * call failed.
 */
export async function loadAllCharacterLedgers(): Promise<CharacterMiningLedger[]> {
  const characters: CharacterRecord[] = await db.characters.toArray();
  if (characters.length === 0) return [];

  const [moonOreTypeIds, oreAndIceTypeIds, manualMoonOreOverrides, manualIgnored] =
    await Promise.all([
      loadMoonOreTypeIds(),
      loadOreAndIceTypeIds(),
      loadManualMoonOreTypeIds(),
      loadManualIgnoredTypeIds(),
    ]);
  // "Tag as moon ore" (typeOverrides.ts) counts as moon ore from now on, in
  // both sets: it groups into entries going forward, and it must stop
  // showing up as unclassified. "Ignore" only joins the broader set — it
  // stops being flagged, but is never grouped into a moon-mining entry,
  // exactly like an already-recognized asteroid ore or ice type.
  const moonOreSet = new Set([...moonOreTypeIds, ...manualMoonOreOverrides]);
  const oreAndIceSet = new Set([...oreAndIceTypeIds, ...manualMoonOreOverrides, ...manualIgnored]);

  const results: CharacterMiningLedger[] = characters.map((c) => ({
    characterId: c.characterId,
    characterName: c.name,
    entries: [],
    unclassifiedTypeIds: [],
    needsReauth: false,
    fetchedAt: null,
    fromCache: true,
  }));

  await mapWithConcurrencyLimit(results, ESI_FANOUT_CONCURRENCY, async (result) => {
    const { cached, needsReauth } = await loadMiningLedger(result.characterId);
    result.needsReauth = needsReauth;
    if (!cached) return;
    result.fetchedAt = cached.fetchedAt;
    result.fromCache = cached.fromCache;
    result.entries = groupMiningLedger(cached.data, result.characterId, moonOreSet);
    result.unclassifiedTypeIds = [
      ...new Set(
        cached.data.filter((row) => !oreAndIceSet.has(row.type_id)).map((row) => row.type_id)
      ),
    ].sort((a, b) => a - b);
  });

  return results;
}
