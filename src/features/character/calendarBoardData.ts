/**
 * The Calendar page's six reads, and the one snapshot they collapse into.
 *
 * Fetch + cache only — the ESI-shape-to-board-source conversion lives next
 * door in `calendarBoardSources.ts`, and the ranking lives in
 * `engine/character/board.ts`. Same three-layer split as the corp board's
 * `boardData` / `boardSources` / `board`.
 *
 * **Each source fails on its own.** Every loader here returns a `StatusResult`
 * rather than throwing on an auth failure, so a Character missing
 * `esi-industry.read_character_jobs.v1` gets a board with no jobs on it and
 * five other clocks intact. A source that could not be read is left
 * `undefined`, which the engine reads as "not readable" — distinct from `[]`,
 * "read fine, nothing due". Collapsing those two would put a confident "no
 * industry jobs" in front of someone who was never allowed to ask.
 */

import type { CalendarEventSummary } from '@/esi/endpoints';
import type {
  BoardCalendarEventSource,
  BoardClockSource,
  CharacterBoardItemKind,
} from '@/engine/character/board';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { loadCalendarEvents } from './calendar';
import { loadContracts } from './contracts';
import { loadOrders } from './orders';
import { loadTypeNames } from './typeNames';
import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, readCachedColonyDetails } from '@/features/pi/data';
import { loadPlanetName } from '@/features/pi/names';
import {
  toCalendarEventSources,
  toContractExpirySources,
  toIndustryJobSources,
  toOrderExpirySources,
  toPlanetExtractionSources,
  toSkillTrainingSources,
  type ColonyPins,
} from './calendarBoardSources';

export interface CalendarBoardData {
  calendarEvents?: BoardCalendarEventSource[];
  skillTraining?: BoardClockSource[];
  industryJobs?: BoardClockSource[];
  planetExtractions?: BoardClockSource[];
  contractExpiries?: BoardClockSource[];
  orderExpiries?: BoardClockSource[];
  /**
   * Kinds whose read came back 401/403. The filter menu names these as "log in
   * again" rather than as a zero, which is the whole reason the page no longer
   * gates wholesale on one scope.
   */
  reauthKinds: CharacterBoardItemKind[];
  /**
   * The oldest `fetchedAt` across the sources that were actually read.
   *
   * The Data Age badge is a promise about the whole view, so a fresh calendar
   * must not vouch for an hour-old jobs list. Sources that were not read at
   * all are excluded rather than counted as infinitely old.
   */
  oldestFetchedAt: Date | null;
  /** Any read served from cache — the view's offline marker. */
  fromCache: boolean;
  /** The raw events, which the detail modal and the CSV export still need. */
  events: CalendarEventSummary[];
  /**
   * The instant this snapshot was assembled, and the `nowMs` every surface on
   * the page ranks against.
   *
   * Read here rather than at render for two reasons. It keeps the route pure —
   * a `Date.now()` inside a `useMemo` is a lint error and, more to the point, a
   * bug waiting for a re-render. And it guarantees the map, the ticker and the
   * rail share one instant: a dot and the row it stands for must not land in
   * different severity bands because they each asked the clock separately.
   */
  loadedAtMs: number;
}

/** `undefined` when the source could not be read, so the engine can tell that from empty. */
function readRows<T>(result: StatusResult<T[]>): readonly T[] | undefined {
  return result.cached?.data;
}

export async function loadCalendarBoard(characterId: number): Promise<CalendarBoardData> {
  const [eventsResult, queueResult, jobsResult, planetsResult, contractsResult, ordersResult] =
    await Promise.all([
      loadCalendarEvents(characterId),
      loadCharacterSkillQueueWithStatus(characterId),
      loadCharacterIndustryJobs(characterId),
      loadCharacterPlanets(characterId),
      loadContracts(characterId),
      loadOrders(characterId),
    ]);

  const events = readRows(eventsResult);
  const queue = readRows(queueResult);
  const jobs = readRows(jobsResult);
  const planets = readRows(planetsResult);
  const contracts = readRows(contractsResult);
  const orders = readRows(ordersResult);

  /**
   * Colony detail from Dexie only, never a fetch.
   *
   * `loadAllColonyDetails` is one live call per planet on the `char-industry`
   * bucket — the same bucket the jobs read above already used. Spending that
   * on a page whose planet rows are one line each is the trade `pi/data.ts`
   * documents against. The cost is that a colony the pilot has never opened on
   * the PI page contributes nothing here; the planets list still counts as
   * readable, because the scope plainly worked.
   */
  const colonies: ColonyPins[] = [];
  if (planets && planets.length > 0) {
    const planetIds = planets.map((planet) => planet.planet_id);
    const [details, planetNames] = await Promise.all([
      readCachedColonyDetails(characterId, planetIds),
      Promise.all(planetIds.map((planetId) => loadPlanetName(planetId))),
    ]);
    planets.forEach((planet, index) => {
      const detail = details.get(planet.planet_id);
      if (!detail) return;
      colonies.push({
        // A planet ESI declines to name falls back to its id, which is at
        // least something the pilot can search the client for.
        planetName: planetNames[index] ?? `#${planet.planet_id}`,
        pins: detail.data.pins,
      });
    });
  }

  // One name resolution for every id the board will show, rather than one per
  // source: `loadTypeNames` is a single SDE read either way.
  const typeIds = new Set<number>();
  for (const entry of queue ?? []) typeIds.add(entry.skill_id);
  for (const job of jobs ?? []) typeIds.add(job.product_type_id ?? job.blueprint_type_id);
  for (const order of orders ?? []) typeIds.add(order.type_id);
  const names = await loadTypeNames([...typeIds]);
  const typeName = (typeId: number) => names.get(typeId) ?? `#${typeId}`;

  const reauthKinds: CharacterBoardItemKind[] = [];
  const noteReauth = (kind: CharacterBoardItemKind, result: StatusResult<unknown[]>) => {
    if (result.needsReauth) reauthKinds.push(kind);
  };
  noteReauth('calendarEvent', eventsResult);
  noteReauth('skillTraining', queueResult);
  noteReauth('industryJob', jobsResult);
  noteReauth('planetExtraction', planetsResult);
  noteReauth('contractExpiry', contractsResult);
  noteReauth('orderExpiry', ordersResult);

  const read: (CachedResult<unknown> | null | undefined)[] = [
    eventsResult.cached,
    queueResult.cached,
    jobsResult.cached,
    planetsResult.cached,
    contractsResult.cached,
    ordersResult.cached,
  ];
  const fetchedAtMs = read
    .filter((result): result is CachedResult<unknown> => Boolean(result))
    .map((result) => result.fetchedAt.getTime());

  return {
    calendarEvents: events && toCalendarEventSources(events),
    skillTraining: queue && toSkillTrainingSources(queue, typeName),
    industryJobs: jobs && toIndustryJobSources(jobs, typeName),
    planetExtractions: planets && toPlanetExtractionSources(colonies),
    contractExpiries: contracts && toContractExpirySources(contracts),
    orderExpiries: orders && toOrderExpirySources(orders, typeName),
    reauthKinds,
    oldestFetchedAt: fetchedAtMs.length > 0 ? new Date(Math.min(...fetchedAtMs)) : null,
    fromCache: read.some((result) => result?.fromCache),
    events: [...(events ?? [])],
    loadedAtMs: Date.now(),
  };
}
