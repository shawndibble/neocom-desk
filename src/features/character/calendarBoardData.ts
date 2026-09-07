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
import { readCachedPlanetNames } from '@/features/pi/names';
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
   * Kinds whose source was read at all — empty or not.
   *
   * Without this the filter menu cannot tell "read fine, nothing due" from
   * "could not read", and falls through to a confident `0` next to a source
   * that failed for any reason other than 401/403: a network drop, a 500, or
   * a colony whose detail has never been cached. That zero is a lie about the
   * pilot's data, and the scope decision forbids it in as many words.
   */
  readableKinds: CharacterBoardItemKind[];
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
   * rail share one instant: a dot and the row it stands for must not land on
   * different days, or show countdowns a minute apart, because they each asked
   * the clock separately.
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
    // `readCachedPlanetNames`, not `loadPlanetName`: the latter is a
    // `loadWithCache`, so a cache miss is one live `/universe/planets/{id}`
    // per colony — exactly the fan-out the paragraph above refuses to spend on
    // this page. An unnamed planet falls back to its id below.
    const [details, planetNames] = await Promise.all([
      readCachedColonyDetails(characterId, planetIds),
      readCachedPlanetNames(planetIds),
    ]);
    for (const planet of planets) {
      const detail = details.get(planet.planet_id);
      if (!detail) continue;
      colonies.push({
        // A planet ESI has not named for us falls back to its id, which is at
        // least something the pilot can search the client for.
        planetName: planetNames.get(planet.planet_id) ?? `#${planet.planet_id}`,
        pins: detail.data.pins,
      });
    }
  }

  // One name resolution for every id the board will show, rather than one per
  // source: `loadTypeNames` is a single SDE read either way.
  const typeIds = new Set<number>();
  for (const entry of queue ?? []) typeIds.add(entry.skill_id);
  for (const job of jobs ?? []) typeIds.add(job.product_type_id ?? job.blueprint_type_id);
  for (const order of orders ?? []) typeIds.add(order.type_id);
  const names = await loadTypeNames([...typeIds]);
  const typeName = (typeId: number) => names.get(typeId) ?? `#${typeId}`;

  /**
   * One row per kind, and every derived answer read off it.
   *
   * The five lists this replaced — the destructure, the `readRows` calls, the
   * `noteReauth` calls, the `cached` array and the return object — each
   * repeated the same six kinds in the same order, so adding a seventh clock
   * meant editing six places and the compiler could only catch one of them.
   * `satisfies` pins the set against the engine's own list instead.
   */
  const sources = [
    { kind: 'calendarEvent', result: eventsResult, rows: events },
    { kind: 'skillTraining', result: queueResult, rows: queue },
    { kind: 'industryJob', result: jobsResult, rows: jobs },
    { kind: 'planetExtraction', result: planetsResult, rows: planets },
    { kind: 'contractExpiry', result: contractsResult, rows: contracts },
    { kind: 'orderExpiry', result: ordersResult, rows: orders },
  ] satisfies {
    kind: CharacterBoardItemKind;
    result: StatusResult<unknown[]>;
    rows: readonly unknown[] | undefined;
  }[];

  const cached: CachedResult<unknown>[] = [];
  for (const source of sources) {
    if (source.result.cached) cached.push(source.result.cached);
  }

  return {
    calendarEvents: events && toCalendarEventSources(events),
    skillTraining: queue && toSkillTrainingSources(queue, typeName),
    industryJobs: jobs && toIndustryJobSources(jobs, typeName),
    planetExtractions: planets && toPlanetExtractionSources(colonies),
    contractExpiries: contracts && toContractExpirySources(contracts),
    orderExpiries: orders && toOrderExpirySources(orders, typeName),
    readableKinds: sources.filter((s) => s.rows !== undefined).map((s) => s.kind),
    reauthKinds: sources.filter((s) => s.result.needsReauth).map((s) => s.kind),
    oldestFetchedAt:
      cached.length > 0
        ? new Date(Math.min(...cached.map((result) => result.fetchedAt.getTime())))
        : null,
    fromCache: cached.some((result) => result.fromCache),
    events: [...(events ?? [])],
    loadedAtMs: Date.now(),
  };
}
