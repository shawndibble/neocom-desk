/**
 * The Calendar's Shared Pops read: `fetchSharedPops` (a callable that spends ESI and Firestore
 * reads on the server) held for a few minutes in the cache the notification poll shares, never
 * called per render, then every name a pop
 * shows resolved once: its moon, its sharing corporation and its ore.
 */
import type { BoardCorporation } from '@/engine/character/board';
import { loadCorpLabels } from '@/features/corp/corpTicker';
import { MINUTE_MS } from '@/lib/age';
import { loadSharedPopsCached } from '@/features/notifications/sharedPopsCache';
import type { SharedPopView } from '@/sync/sharedPops';
import { loadMoonNames } from './moonNames';
import { loadTypeNames } from './typeNames';
import { countedScans, summarizeSurvey } from '@/engine/survey/series';
import { sharedPopIsShown, type SharedPopEntry, type SharedPopSurvey } from './calendarSharedPops';

/** How long one read serves the Calendar before it asks again. */
export const SHARED_POPS_TTL_MS = 5 * MINUTE_MS;

/**
 * The viewer's Shared Pops from the one cache the notification poll shares
 * (`sharedPopsCache.ts`), no older than `SHARED_POPS_TTL_MS`; a failed read is not kept.
 */
const readSharedPops = (nowMs: number): Promise<SharedPopView[]> =>
  loadSharedPopsCached(nowMs, SHARED_POPS_TTL_MS);

export interface SharedPopsRead {
  /** Every live pop with its names; `undefined` when the read failed. */
  entries?: SharedPopEntry[];
  /** The sharing corporations by name: the filter's choices. */
  corporations: BoardCorporation[];
}

/**
 * The state of each Survey an officer linked to a pop that is on the Calendar: finished, and how
 * much of the field is left. The Survey store reaches Firebase, so it loads on demand and never
 * into the boot graph. A Survey that cannot be read (expired, offline) is left out: no state.
 */
async function readSurveyStates(
  pops: readonly SharedPopView[],
  nowMs: number
): Promise<Map<string, SharedPopSurvey>> {
  const ids = [
    ...new Set(
      pops.flatMap((pop) => (pop.surveyId && sharedPopIsShown(pop, nowMs) ? [pop.surveyId] : []))
    ),
  ];
  const states = new Map<string, SharedPopSurvey>();
  if (ids.length === 0) return states;
  const { loadSurveyCached } = await import('@/features/survey/surveyStore');
  await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await loadSurveyCached(id);
        if (!result.ok) return;
        const summary = summarizeSurvey(countedScans(result.scans, result.ignored));
        if (summary === null) return;
        states.set(id, {
          finished: summary.finished,
          percentLeft: summary.finished ? 0 : Math.max(1, 100 - summary.percent),
        });
      } catch {
        // No state for this one: the row falls back to the officer's flag.
      }
    })
  );
  return states;
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
  const [moonNames, labels, typeNames, surveys] = await Promise.all([
    loadMoonNames(pops.map((pop) => pop.moonId)),
    loadCorpLabels([...new Set(pops.map((pop) => pop.corporationId))]),
    typeIds.length > 0 ? loadTypeNames(typeIds) : new Map<number, string>(),
    readSurveyStates(pops, nowMs),
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
    ...(pop.surveyId && surveys.has(pop.surveyId) ? { survey: surveys.get(pop.surveyId) } : {}),
  }));
  const corporations = [...new Map(entries.map((e) => [e.corporation.id, e.corporation])).values()];
  return { entries, corporations: corporations.sort((a, b) => a.name.localeCompare(b.name)) };
}
