import i18n from 'i18next';
import type { CalendarEventSummary, Contract } from '@/esi/endpoints';
import type {
  BoardCalendarEventSource,
  BoardClockSource,
  BoardCorporation,
  CharacterBoardItemKind,
} from '@/engine/character/board';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { isActiveContractStatus } from '@/engine/contracts/contractStatus';
import { loadCalendarEvents } from './calendar';
import { loadContracts } from './contracts';
import { loadContractLocationName } from './contractLocationName';
import { CONTRACT_TYPE_KEY } from './contractLabels';
import { loadOrders } from './orders';
import { loadTypeNames } from './typeNames';
import { loadCharacterSkillQueueWithStatus } from '@/features/skills/data';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, readCachedColonyDetails } from '@/features/pi/data';
import { readCachedPlanetNames } from '@/features/pi/names';
import { db } from '@/db';
import { acceleratorId } from '@/features/accelerator/characterAccelerators';
import { loadCorpCalendar } from './calendarCorpDeadlines';
import { loadSkyhookRaids } from './calendarSkyhooks';
import { loadSharedPopsRead } from './calendarSharedPopsRead';
import { toSharedPopSources, type SharedPopEntry } from './calendarSharedPops';
import { loadCharacterDenRows } from './mercenaryDens';
import { fanOutAllCharacters } from './allCharactersFanOut';
import { mergeCalendarBoards, type CharacterCalendarBoard } from './calendarBoardAcross';
import type { SkyhookRaid } from './calendarBoardSources';
import {
  toCalendarEventSources,
  toContractExpirySources,
  toIndustryJobSources,
  toMercenaryDenSources,
  toOrderExpirySources,
  toAcceleratorSources,
  toPlanetExtractionSources,
  toSkillTrainingSources,
  type ColonyPins,
} from './calendarBoardSources';

export interface CalendarBoardData {
  calendarEvents?: BoardCalendarEventSource[];
  skillTraining?: BoardClockSource[];
  industryJobs?: BoardClockSource[];
  planetExtractions?: BoardClockSource[];
  mercenaryDens?: BoardClockSource[];
  moonChunks?: BoardClockSource[];
  structureFuel?: BoardClockSource[];
  structureTimers?: BoardClockSource[];
  corpJobs?: BoardClockSource[];
  corporations: BoardCorporation[];
  sharedMoonPops?: BoardClockSource[];
  sharedPops: SharedPopEntry[];
  readableRefineries: number[];
  sharingCorporations: BoardCorporation[];
  skyhookRaids?: BoardClockSource[];
  skyhookRaidDetails: SkyhookRaid[];
  contractExpiries?: BoardClockSource[];
  orderExpiries?: BoardClockSource[];
  accelerator?: BoardClockSource[];
  readableKinds: CharacterBoardItemKind[];
  reauthKinds: CharacterBoardItemKind[];
  oldestFetchedAt: Date | null;
  fromCache: boolean;
  events: CalendarEventSummary[];
  loadedAtMs: number;
}

const NO_CACHE: StatusResult<unknown[]> = { cached: null, needsReauth: false };

function readRows<T>(result: StatusResult<T[]>): readonly T[] | undefined {
  return result.cached?.data;
}

async function loadCourierRouteNames(
  characterId: number,
  contracts: readonly Contract[]
): Promise<Map<number, string>> {
  const locationIds = new Set<number>();
  for (const contract of contracts) {
    if (contract.type !== 'courier' || contract.title) continue;
    if (!isActiveContractStatus(contract.status)) continue;
    if (contract.start_location_id) locationIds.add(contract.start_location_id);
    if (contract.end_location_id) locationIds.add(contract.end_location_id);
  }
  const names = new Map<number, string>();
  await Promise.all(
    [...locationIds].map(async (id) => {
      const name = await loadContractLocationName(characterId, id);
      if (name) names.set(id, name);
    })
  );
  return names;
}

export async function loadCalendarBoard(characterId: number): Promise<CalendarBoardData> {
  const loadedAtMs = Date.now();
  const [
    eventsResult,
    queueResult,
    jobsResult,
    planetsResult,
    contractsResult,
    ordersResult,
    corpRead,
    skyhookRead,
    densResult,
    typedAccelerator,
    sharedPopsRead,
  ] = await Promise.all([
    loadCalendarEvents(characterId),
    loadCharacterSkillQueueWithStatus(characterId),
    loadCharacterIndustryJobs(characterId),
    loadCharacterPlanets(characterId),
    loadContracts(characterId),
    loadOrders(characterId),
    loadCorpCalendar(loadedAtMs),
    loadSkyhookRaids(characterId, loadedAtMs),
    loadCharacterDenRows(characterId),
    db.characterAccelerators.get(acceleratorId(characterId)),
    loadSharedPopsRead(loadedAtMs),
  ]);
  const sharedMoonPops =
    sharedPopsRead.entries &&
    toSharedPopSources(sharedPopsRead.entries, new Set(corpRead.refineryIds), loadedAtMs);

  const acceleratorSources = toAcceleratorSources(typedAccelerator, loadedAtMs, (bonus) =>
    i18n.t('calendar.acceleratorSubject', { bonus })
  );
  const events = readRows(eventsResult);
  const queue = readRows(queueResult);
  const jobs = readRows(jobsResult);
  const planets = readRows(planetsResult);
  const contracts = readRows(contractsResult);
  const orders = readRows(ordersResult);
  const dens = readRows(densResult);

  const colonies: ColonyPins[] = [];
  if (planets && planets.length > 0) {
    const planetIds = planets.map((planet) => planet.planet_id);
    const [details, planetNames] = await Promise.all([
      readCachedColonyDetails(characterId, planetIds),
      readCachedPlanetNames(planetIds),
    ]);
    for (const planet of planets) {
      const detail = details.get(planet.planet_id);
      if (!detail) continue;
      colonies.push({
        planetName: planetNames.get(planet.planet_id) ?? `#${planet.planet_id}`,
        pins: detail.data.pins,
      });
    }
  }

  const typeIds = new Set<number>();
  for (const entry of queue ?? []) typeIds.add(entry.skill_id);
  for (const job of jobs ?? []) typeIds.add(job.product_type_id ?? job.blueprint_type_id);
  for (const order of orders ?? []) typeIds.add(order.type_id);
  const [names, courierRouteNames] = await Promise.all([
    loadTypeNames([...typeIds]),
    loadCourierRouteNames(characterId, contracts ?? []),
  ]);
  const typeName = (typeId: number) => names.get(typeId) ?? `#${typeId}`;
  const contractTypeLabel = (type: Contract['type']) => i18n.t(CONTRACT_TYPE_KEY[type]);
  const contractRouteName = (contract: Contract): string | undefined => {
    if (contract.type !== 'courier') return undefined;
    const start = contract.start_location_id
      ? courierRouteNames.get(contract.start_location_id)
      : undefined;
    const end = contract.end_location_id
      ? courierRouteNames.get(contract.end_location_id)
      : undefined;
    return start && end ? i18n.t('contracts.courierRoute', { start, end }) : undefined;
  };

  const sources = [
    { kind: 'calendarEvent', result: eventsResult, rows: events },
    { kind: 'skillTraining', result: queueResult, rows: queue },
    { kind: 'industryJob', result: jobsResult, rows: jobs },
    { kind: 'planetExtraction', result: planetsResult, rows: planets },
    { kind: 'mercenaryDen', result: densResult, rows: dens },
    { kind: 'accelerator', result: NO_CACHE, rows: acceleratorSources },
    { kind: 'structureTimer', result: NO_CACHE, rows: corpRead.structureTimers },
    { kind: 'structureFuel', result: NO_CACHE, rows: corpRead.structureFuel },
    { kind: 'moonChunk', result: NO_CACHE, rows: corpRead.moonChunks },
    { kind: 'sharedMoonPop', result: NO_CACHE, rows: sharedMoonPops },
    { kind: 'corpJob', result: NO_CACHE, rows: corpRead.corpJobs },
    { kind: 'skyhookRaid', result: skyhookRead.result, rows: skyhookRead.sources },
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
  const fetchedAt = [
    ...cached.map((result) => result.fetchedAt.getTime()),
    ...corpRead.fetched.map((at) => at.getTime()),
  ];

  return {
    calendarEvents: events && toCalendarEventSources(events),
    skillTraining: queue && toSkillTrainingSources(queue, typeName),
    industryJobs: jobs && toIndustryJobSources(jobs, typeName, loadedAtMs),
    planetExtractions: planets && toPlanetExtractionSources(colonies),
    mercenaryDens: dens && toMercenaryDenSources(dens, loadedAtMs),
    moonChunks: corpRead.moonChunks,
    structureFuel: corpRead.structureFuel,
    structureTimers: corpRead.structureTimers,
    corpJobs: corpRead.corpJobs,
    corporations: corpRead.corporations,
    sharedMoonPops,
    sharedPops: sharedPopsRead.entries ?? [],
    readableRefineries: corpRead.refineryIds,
    sharingCorporations: sharedPopsRead.corporations,
    skyhookRaids: skyhookRead.sources,
    skyhookRaidDetails: skyhookRead.raids,
    contractExpiries:
      contracts && toContractExpirySources(contracts, contractTypeLabel, contractRouteName),
    orderExpiries: orders && toOrderExpirySources(orders, typeName),
    accelerator: acceleratorSources,
    readableKinds: sources.filter((s) => s.rows !== undefined).map((s) => s.kind),
    reauthKinds: sources.filter((s) => s.result.needsReauth).map((s) => s.kind),
    oldestFetchedAt: fetchedAt.length > 0 ? new Date(Math.min(...fetchedAt)) : null,
    fromCache: corpRead.fromCache || cached.some((result) => result.fromCache),
    events: [...(events ?? [])],
    loadedAtMs,
  };
}

export async function loadAllCalendarBoard(): Promise<CalendarBoardData> {
  const { entries } = await fanOutAllCharacters<CharacterCalendarBoard>({
    load: async ({ characterId, name }) => ({
      characterId,
      name,
      data: await loadCalendarBoard(characterId),
    }),
  });
  if (entries.length === 0) throw new Error('The calendar could not be read');
  return mergeCalendarBoards(entries);
}
