import { db, type CharacterRecord } from '@/db';
import { getCharacterMining } from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  loadPaginatedWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { groupMiningLedger } from '@/engine/miningTax/groupLedger';
import { groupMiningYield, type MiningYieldEntry } from '@/engine/miningTax/yieldGrouping';
import { mergeLedgerHistory } from '@/engine/miningTax/ledgerHistory';
import type { MiningLedgerEntry, MiningLedgerRow } from '@/engine/miningTax/types';
import { loadGasCloudTypeIds, loadMoonOreTypeIds, loadOreAndIceTypeIds } from '@/sde/loadSde';
import { loadManualIgnoredTypeIds, loadManualMoonOreTypeIds } from './typeOverrides';

export const KEYS = { ledger: 'miningTax:ledger' } as const;

export function loadMiningLedger(characterId: number): Promise<StatusResult<MiningLedgerRow[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterMining(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEYS.ledger, fetchLive, { conditional });
}

async function withLedgerHistory(
  characterId: number,
  cached: CachedResult<MiningLedgerRow[]> | null
): Promise<MiningLedgerRow[]> {
  const stored = await db.miningLedgerHistory.get(characterId);
  if (!cached) return stored?.rows ?? [];
  const fetchedAt = cached.fetchedAt.getTime();
  if (stored && fetchedAt <= stored.fetchedAt) return stored.rows;
  const rows = mergeLedgerHistory(stored?.rows ?? [], cached.data);
  await db.miningLedgerHistory.put({ characterId, rows, fetchedAt });
  return rows;
}

export interface CharacterMiningLedger {
  characterId: number;
  characterName: string;
  entries: MiningLedgerEntry[];
  unclassifiedTypeIds: number[];
  needsReauth: boolean;
  fetchedAt: Date | null;
  fromCache: boolean;
}

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

export interface CharacterMiningYield {
  characterId: number;
  characterName: string;
  entries: MiningYieldEntry[];
  needsReauth: boolean;
  fetchedAt: Date | null;
  fromCache: boolean;
}

export async function loadAllCharacterYields(): Promise<CharacterMiningYield[]> {
  const characters: CharacterRecord[] = await db.characters.toArray();
  if (characters.length === 0) return [];

  const [oreAndIceTypeIds, gasCloudTypeIds, manualMoonOreOverrides, manualIgnored] =
    await Promise.all([
      loadOreAndIceTypeIds(),
      loadGasCloudTypeIds(),
      loadManualMoonOreTypeIds(),
      loadManualIgnoredTypeIds(),
    ]);
  const harvestedSet = new Set([
    ...oreAndIceTypeIds,
    ...gasCloudTypeIds,
    ...manualMoonOreOverrides,
    ...manualIgnored,
  ]);

  const results: CharacterMiningYield[] = characters.map((c) => ({
    characterId: c.characterId,
    characterName: c.name,
    entries: [],
    needsReauth: false,
    fetchedAt: null,
    fromCache: true,
  }));

  await mapWithConcurrencyLimit(results, ESI_FANOUT_CONCURRENCY, async (result) => {
    const { cached, needsReauth } = await loadMiningLedger(result.characterId);
    result.needsReauth = needsReauth;
    if (cached) {
      result.fetchedAt = cached.fetchedAt;
      result.fromCache = cached.fromCache;
    }
    const rows = await withLedgerHistory(result.characterId, cached);
    result.entries = groupMiningYield(rows, result.characterId, harvestedSet);
  });

  return results;
}
