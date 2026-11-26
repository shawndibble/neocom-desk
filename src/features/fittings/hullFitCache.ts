import { db } from '@/db';
import type { CandidateCheck } from './dogmaFittingEngine';
import { packCheck, unpackCheck } from '@/engine/fittings/hullFitKey';

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
  } catch {}
}
