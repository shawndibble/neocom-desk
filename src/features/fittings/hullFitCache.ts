/**
 * The saved half of the module browser's hull check (`hullFitService`): one
 * row per hull and skill set, so a return visit — even after a reload —
 * skips the engine. Device-local and rebuildable; every failure here is
 * swallowed, since a missing cache only means the check runs again.
 */
import { db } from '@/db';
import type { CandidateCheck } from './dogmaFittingEngine';
import { packCheck, unpackCheck } from '@/engine/fittings/hullFitKey';

/** Newest rows kept; a row is ~25 KB, and a pilot flies a handful of hulls. */
const MAX_ROWS = 40;

export async function loadSavedHullFit(key: string): Promise<Map<number, CandidateCheck> | null> {
  try {
    const row = await db.hullFitCache.get(key);
    if (!row) return null;
    return new Map(row.entries.map(([typeId, bits]) => [typeId, unpackCheck(bits)]));
  } catch {
    return null;
  }
}

export async function saveHullFit(
  key: string,
  checks: ReadonlyMap<number, CandidateCheck>
): Promise<void> {
  try {
    await db.hullFitCache.put({
      key,
      savedAt: Date.now(),
      entries: [...checks].map(([typeId, check]) => [typeId, packCheck(check)]),
    });
    const count = await db.hullFitCache.count();
    if (count > MAX_ROWS) {
      const oldest = await db.hullFitCache
        .orderBy('savedAt')
        .limit(count - MAX_ROWS)
        .primaryKeys();
      await db.hullFitCache.bulkDelete(oldest);
    }
  } catch {
    // A full disk or a blocked database: the answer just isn't kept.
  }
}
