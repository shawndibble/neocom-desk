import type { BoardCorporation } from '@/engine/character/board';
import { loadCorpLabels } from '@/features/corp/corpTicker';
import { MINUTE_MS } from '@/lib/age';
import { loadSharedPopsCached } from '@/features/notifications/sharedPopsCache';
import type { SharedPopView } from '@/sync/sharedPops';
import { loadMoonNames } from './moonNames';
import { loadTypeNames } from './typeNames';
import { countedScans, summarizeSurvey } from '@/engine/survey/series';
import { sharedPopIsShown, type SharedPopEntry, type SharedPopSurvey } from './calendarSharedPops';

export const SHARED_POPS_TTL_MS = 5 * MINUTE_MS;

const readSharedPops = (nowMs: number, maxAgeMs: number): Promise<SharedPopView[]> =>
  loadSharedPopsCached(nowMs, maxAgeMs);

export interface SharedPopsRead {
  entries?: SharedPopEntry[];
  corporations: BoardCorporation[];
}

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
          ores: summary.ores
            .filter((o) => o.startVolume > 0 && summary.startVolume > 0)
            .map((o) => ({
              name: o.ore,
              percent: Math.max(1, Math.round((o.startVolume / summary.startVolume) * 100)),
            }))
            .sort((a, b) => b.percent - a.percent),
        });
      } catch {}
    })
  );
  return states;
}

export async function loadSharedPopsRead(
  nowMs: number,
  maxAgeMs: number = SHARED_POPS_TTL_MS
): Promise<SharedPopsRead> {
  let pops: SharedPopView[];
  try {
    pops = await readSharedPops(nowMs, maxAgeMs);
  } catch {
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
