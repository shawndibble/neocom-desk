/**
 * BPC Sourcing watch CRUD (issue #926): a device-local list of saved
 * searches, watched by `watchPoller.ts` for a genuinely new or cheaper
 * matching offer. Unlike a Build Plan or a Payee, these are never synced —
 * same trade the Quickbar's price-alert *target* makes, since the watch is a
 * personal search rather than shared Editable Data, and it carries no
 * `characterId` at all (`db.BpcSearchWatchRecord`'s doc comment).
 */
import { db, type BpcSearchWatchRecord } from '@/db';
import { EMPTY_BPC_SEARCH_FILTER, type BpcSearchFilter } from '@/engine/contracts/bpcSearch';
import type { BpcWatchState } from '@/engine/contracts/bpcWatch';
import type { SpaceKind } from '@/engine/space';

export function listWatches(): Promise<BpcSearchWatchRecord[]> {
  return db.bpcSearchWatches.toArray();
}

/** What a watch's search narrows on — the persistence-agnostic shape both `createWatch` and `updateWatchFilter` take. */
export interface BpcWatchFilterInput {
  typeIds: readonly number[] | null;
  regionId: number | null;
  minMe: number | null;
  minTe: number | null;
  minRuns: number | null;
  maxPrice: number | null;
  spaceKinds: readonly SpaceKind[] | null;
}

/** The record's stored filter fields, converted back into `BpcSearchFilter`'s `Set`-shaped fields for `filterBpcContracts`/`diffBpcWatchMatches`. */
export function watchToFilter(watch: BpcSearchWatchRecord): BpcSearchFilter {
  return {
    ...EMPTY_BPC_SEARCH_FILTER,
    typeIds: watch.typeIds ? new Set(watch.typeIds) : null,
    regionId: watch.regionId,
    minMe: watch.minMe,
    minTe: watch.minTe,
    minRuns: watch.minRuns,
    maxPrice: watch.maxPrice,
    spaceKinds: watch.spaceKinds ? new Set(watch.spaceKinds as SpaceKind[]) : null,
  };
}

function filterFields(filter: BpcWatchFilterInput) {
  return {
    typeIds: filter.typeIds ? [...filter.typeIds] : null,
    regionId: filter.regionId,
    minMe: filter.minMe,
    minTe: filter.minTe,
    minRuns: filter.minRuns,
    maxPrice: filter.maxPrice,
    spaceKinds: filter.spaceKinds ? [...filter.spaceKinds] : null,
  };
}

export async function createWatch(
  name: string,
  filter: BpcWatchFilterInput
): Promise<BpcSearchWatchRecord> {
  const now = Date.now();
  const record: BpcSearchWatchRecord = {
    id: crypto.randomUUID(),
    name,
    ...filterFields(filter),
    seenContractIds: [],
    minPriceSeen: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.bpcSearchWatches.put(record);
  return record;
}

export async function renameWatch(
  watch: BpcSearchWatchRecord,
  name: string
): Promise<BpcSearchWatchRecord> {
  const updated: BpcSearchWatchRecord = { ...watch, name, updatedAt: Date.now() };
  await db.bpcSearchWatches.put(updated);
  return updated;
}

/**
 * Replaces a watch's search and re-arms it: a changed filter is a fresh,
 * unobserved search, so the diff baseline resets to empty rather than
 * carrying over the old search's `seenContractIds`/`minPriceSeen` — the same
 * re-arm-on-edit rule a Quickbar price alert's re-fire identity gets for free
 * (`20260909-192510-quickbar-price-alerts-re-arm-key-hub-price.md`), applied
 * explicitly here since this watch's baseline is a stored field, not an
 * implicit tuple.
 */
export async function updateWatchFilter(
  watch: BpcSearchWatchRecord,
  filter: BpcWatchFilterInput
): Promise<BpcSearchWatchRecord> {
  const updated: BpcSearchWatchRecord = {
    ...watch,
    ...filterFields(filter),
    seenContractIds: [],
    minPriceSeen: null,
    updatedAt: Date.now(),
  };
  await db.bpcSearchWatches.put(updated);
  return updated;
}

export async function deleteWatch(id: string): Promise<void> {
  await db.bpcSearchWatches.delete(id);
}

/** Persists one poll's diff baseline for one watch — `watchPoller.ts`'s write, never the UI's. */
export async function saveWatchState(id: string, state: BpcWatchState): Promise<void> {
  await db.bpcSearchWatches.update(id, {
    seenContractIds: [...state.seenContractIds],
    minPriceSeen: state.minPriceSeen,
  });
}
