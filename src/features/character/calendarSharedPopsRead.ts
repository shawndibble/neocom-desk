/**
 * The Calendar's Shared Pops read: `fetchSharedPops` (a callable that spends ESI and Firestore
 * reads on the server) held for a few minutes, never called per render, then every name a pop
 * shows resolved once: its moon, its sharing corporation and its ore.
 */
import type { BoardCorporation } from '@/engine/character/board';
import { loadCorpLabels } from '@/features/corp/corpTicker';
import { registerTestReset } from '@/lib/testResets';
import { MINUTE_MS } from '@/lib/age';
import { fetchSharedPops, type SharedPopView } from '@/sync/sharedPops';
import { loadMoonNames } from './moonNames';
import { loadTypeNames } from './typeNames';
import type { SharedPopEntry } from './calendarSharedPops';

/** How long one read serves the Calendar before it asks again. */
export const SHARED_POPS_TTL_MS = 5 * MINUTE_MS;

let held: { atMs: number; pops: Promise<SharedPopView[]> } | null = null;
registerTestReset(() => {
  held = null;
});

/** The viewer's Shared Pops, read at most once per `SHARED_POPS_TTL_MS`; a failed read is not kept. */
function readSharedPops(nowMs: number): Promise<SharedPopView[]> {
  if (held !== null && nowMs - held.atMs < SHARED_POPS_TTL_MS) return held.pops;
  const pops = fetchSharedPops();
  const entry = { atMs: nowMs, pops };
  held = entry;
  pops.catch(() => {
    if (held === entry) held = null;
  });
  return pops;
}

export interface SharedPopsRead {
  /** Every live pop with its names; `undefined` when the read failed. */
  entries?: SharedPopEntry[];
  /** The sharing corporations by name: the filter's choices. */
  corporations: BoardCorporation[];
}

export async function loadSharedPopsRead(nowMs: number): Promise<SharedPopsRead> {
  let pops: SharedPopView[];
  try {
    pops = await readSharedPops(nowMs);
  } catch {
    // Signed out of sync, offline, or the server failed: the pilot's own clocks still draw.
    return { corporations: [] };
  }
  if (pops.length === 0) return { entries: [], corporations: [] };

  const typeIds = pops.flatMap((pop) => (pop.ore ?? []).map((line) => line.typeId));
  const [moonNames, labels, typeNames] = await Promise.all([
    loadMoonNames(pops.map((pop) => pop.moonId)),
    loadCorpLabels([...new Set(pops.map((pop) => pop.corporationId))]),
    typeIds.length > 0 ? loadTypeNames(typeIds) : new Map<number, string>(),
  ]);
  const corporation = (id: number): BoardCorporation => {
    const label = labels.get(id);
    return { id, name: label?.name ?? String(id), ticker: label?.ticker ?? String(id) };
  };
  const entries = pops.map((pop): SharedPopEntry => ({
    pop,
    moonName: moonNames.get(pop.moonId) ?? null,
    corporation: corporation(pop.corporationId),
    ore:
      pop.ore === null
        ? null
        : pop.ore.map((line) => ({
            name: typeNames.get(line.typeId) ?? `#${line.typeId}`,
            quantity: line.quantity,
          })),
  }));
  const corporations = [...new Map(entries.map((e) => [e.corporation.id, e.corporation])).values()];
  return { entries, corporations: corporations.sort((a, b) => a.name.localeCompare(b.name)) };
}
