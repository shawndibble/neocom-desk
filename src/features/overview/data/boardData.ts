import { colonyStatus } from '@/engine/pi/colonyStatus';
import { groupColoniesIntoBatches, type ColonyBatch } from '@/engine/pi/colonyBatches';
import type { ColonyStatus } from '@/engine/pi/types';
import { loadAllCharactersIndustryJobs, loadCharacterIndustryJobs } from '@/features/industry/jobs';
import type { JobSlotJob, JobSlotSkills } from '@/engine/industry/jobSlots';
import { toJobSlotJobs } from '@/features/character/jobSlotSkills';
import { loadJobSlotSkills } from '@/features/industry/planJobSlots';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { Contract, IndustryJob } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadAllColonyDetails, loadCharacterPlanets } from '@/features/pi/data';
import { loadPlanetName } from '@/features/pi/names';
import { extractorProgramsFromPins } from '@/engine/pi/colonyPins';
import { loadTypeNames } from '@/features/character/typeNames';
import { mergePlanetaryBoards, type CharacterPlanetaryBoard } from './planetaryAcross';
import { INBOX_ROWS, mergeMailBoards, RECENT_ROWS } from './mailAcross';
import { loadContracts } from '@/features/character/contracts';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import {
  summarizeContractsBoard,
  type ContractsBoardSummary,
} from '@/engine/contracts/contractsBoard';
import { loadMailHeaders, loadMailLabels } from '@/features/character/mail';
import { resolveNames } from '@/features/character/names';
import { db } from '@/db';
import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { lastPriceAlertSnapshot } from '@/features/notifications/pollDomains';
import { buildPriceAlertRows, type BoardPriceAlert } from './priceAlertsBoard';
import { tradeHubIdFor } from '@/features/market/hub';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { sum } from '@/engine/math';
import { oldestOwedMs, payeesOwed, type PayeeOwed } from './miningTaxPayees';
import type {
  BoardExtractionSource,
  BoardStructureSource,
  CorpBoardItem,
} from '@/engine/corp/board';
import type { BoardClockSource } from '@/engine/character/board';
import type { PopShareMark } from '@/engine/corpTaxBook/popShareMarks';
import type { CorpLabel } from '@/features/corp/corpTicker';
import { DAY_MS } from '@/lib/age';

export interface BoardColony {
  planetId: number;
  name: string | null;
  status: ColonyStatus;
  programCount?: number;
  ownerId?: number;
  ownerName?: string;
}

export interface PlanetaryBoardData {
  batches: ColonyBatch<BoardColony>[];
  colonyCount: number;
  programCount: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
  loadedAt: number;
}

const EMPTY_PLANETARY: PlanetaryBoardData = {
  batches: [],
  colonyCount: 0,
  programCount: 0,
  needsReauth: false,
  fetchedAt: null,
  loadedAt: 0,
};

export async function loadPlanetaryBoard(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<PlanetaryBoardData> {
  const { cached, needsReauth } = await loadCharacterPlanets(characterId);
  if (!cached && !needsReauth) throw new Error('Colonies could not be read');
  const loadedAt = Date.now();
  const planets = cached?.data ?? [];
  const base = {
    ...EMPTY_PLANETARY,
    needsReauth,
    fetchedAt: cached ? cached.fetchedAt : null,
    colonyCount: planets.length,
    loadedAt,
  };
  if (signal.cancelled || planets.length === 0) return base;

  const [details, names] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      planets.map((planet) => planet.planet_id)
    ),
    Promise.all(planets.map((planet) => loadPlanetName(planet.planet_id))),
  ]);

  let programCount = 0;
  const colonies: BoardColony[] = planets.map((planet, i) => {
    const pins = details.get(planet.planet_id)?.cached?.data.pins ?? [];
    const programs = extractorProgramsFromPins(pins);
    programCount += programs.length;
    return {
      planetId: planet.planet_id,
      name: names[i],
      status: colonyStatus(programs, loadedAt),
      programCount: programs.length,
    };
  });

  return {
    ...base,
    programCount,
    batches: groupColoniesIntoBatches(colonies, (colony) => colony.status, loadedAt),
  };
}

export async function loadAllPlanetaryBoard(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<PlanetaryBoardData> {
  const { fanOutAllCharacters } = await import('@/features/character/allCharactersFanOut');
  const scope = ESI_REGISTRY.getCharacterPlanets.scope;
  const { entries } = await fanOutAllCharacters<CharacterPlanetaryBoard>({
    scope,
    load: async ({ characterId, name }) => ({
      characterId,
      name,
      data: await loadPlanetaryBoard(characterId, signal),
    }),
  });
  if (entries.length === 0) {
    if (await nobodyGranted(scope)) {
      return { ...EMPTY_PLANETARY, needsReauth: true, loadedAt: Date.now() };
    }
    throw new Error('Colonies could not be read');
  }
  return mergePlanetaryBoards(entries);
}

export interface MiningTaxBoardData {
  unpaidIsk: number;
  payeeCount: number;
  unassignedCount: number;
  oldestUnpaidDays: number | null;
  needsReauth: boolean;
  fetchedAt: Date | null;
  payees?: PayeeOwed[];
  characterCount: number;
  missingCharacterNames: string[];
  missingCharacterIds?: number[];
}

export async function loadMiningTaxBoard(): Promise<MiningTaxBoardData> {
  const [{ loadMoonMiningTaxSnapshot }, { loadOwedBalances }] = await Promise.all([
    import('@/features/miningTax/snapshot'),
    import('@/features/miningTax/owedNow'),
  ]);
  const snapshot = await loadMoonMiningTaxSnapshot();
  const now = Date.now();
  const { balances, unassignedCount } = await loadOwedBalances(snapshot, now);
  const payees = payeesOwed(balances, now);
  const oldestUnpaidMs = oldestOwedMs(balances);

  return {
    unpaidIsk: sum(payees.map((p) => p.unpaidIsk)),
    payeeCount: payees.length,
    unassignedCount,
    oldestUnpaidDays: oldestUnpaidMs === null ? null : Math.floor((now - oldestUnpaidMs) / DAY_MS),
    needsReauth:
      snapshot.reauthCharacters.length > 0 &&
      snapshot.reauthCharacters.length >= snapshot.characters.length,
    fetchedAt: snapshot.fetchedAt,
    payees,
    characterCount: await db.characters.count(),
    missingCharacterNames: snapshot.reauthCharacters.map((character) => character.characterName),
    missingCharacterIds: snapshot.reauthCharacters.map((character) => character.characterId),
  };
}

export interface IndustryCharacterSlots {
  characterId: number;
  characterName: string;
  skills: JobSlotSkills;
  jobs: JobSlotJob[];
}

export interface IndustryBoardData {
  jobs: IndustryJob[];
  allJobs?: IndustryJob[];
  slots?: IndustryCharacterSlots[];
  productNames: Map<number, string>;
  locationNames?: Map<number, string>;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

const MAX_JOB_LOCATIONS = 6;

async function loadIndustrySlots(
  entries: readonly { characterId: number; characterName: string; jobs: IndustryJob[] }[]
): Promise<IndustryCharacterSlots[]> {
  const nowMs = Date.now();
  const slots: (IndustryCharacterSlots | null)[] = entries.map(() => null);
  await mapWithConcurrencyLimit(
    entries.map((entry, index) => ({ entry, index })),
    ESI_FANOUT_CONCURRENCY,
    async ({ entry, index }) => {
      try {
        const skills = await loadJobSlotSkills(entry.characterId, nowMs);
        if (!skills) return;
        slots[index] = {
          characterId: entry.characterId,
          characterName: entry.characterName,
          skills,
          jobs: toJobSlotJobs(entry.jobs),
        };
      } catch {}
    }
  );
  return slots.filter((row): row is IndustryCharacterSlots => row !== null);
}

export async function loadIndustryBoard(characterId: number): Promise<IndustryBoardData> {
  const fanOut = await loadAllCharactersIndustryJobs();
  const ownEntry = fanOut.entries.find((entry) => entry.characterId === characterId);
  const { cached, needsReauth } =
    ownEntry?.result ?? (await loadCharacterIndustryJobs(characterId));
  if (!cached && !needsReauth) throw new Error('Industry jobs could not be read');
  const jobs = cached?.data ?? [];
  const known = fanOut.entries.flatMap((entry) =>
    entry.result.cached && !entry.result.needsReauth
      ? [{ ...entry, jobs: entry.result.cached.data }]
      : []
  );
  const allJobs = [
    ...jobs,
    ...known.filter((entry) => entry.characterId !== characterId).flatMap((entry) => entry.jobs),
  ];
  const slots = await loadIndustrySlots(known);

  const typeIds = allJobs.map((job) => job.product_type_id ?? job.blueprint_type_id);
  const names = typeIds.length > 0 ? await loadTypeNames(typeIds) : new Map<number, string>();
  const productNames = new Map<number, string>();
  for (const job of allJobs) {
    const name = names.get(job.product_type_id ?? job.blueprint_type_id);
    if (name !== undefined) productNames.set(job.job_id, name);
  }

  const locationIds = [...new Set(jobs.map((job) => job.station_id))]
    .filter((id) => id > 0)
    .slice(0, MAX_JOB_LOCATIONS);
  const located = await Promise.all(
    locationIds.map((id) => loadContractLocationName(characterId, id).catch(() => null))
  );
  const locationNames = new Map<number, string>();
  locationIds.forEach((id, i) => {
    const name = located[i];
    if (name) locationNames.set(id, name);
  });

  return {
    jobs,
    allJobs,
    slots,
    productNames,
    locationNames,
    needsReauth,
    fetchedAt: cached ? cached.fetchedAt : null,
  };
}

export interface ContractsBoardData {
  summary: ContractsBoardSummary;
  route: string | null;
  routes?: Record<number, readonly [string, string]>;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

export async function loadContractsBoard(characterId: number): Promise<ContractsBoardData> {
  const { cached, needsReauth } = await loadContracts(characterId);
  if (!cached && !needsReauth) throw new Error('Contracts could not be read');
  return contractsBoardOf(
    cached?.data ?? [],
    characterId,
    characterId,
    needsReauth,
    cached?.fetchedAt ?? null
  );
}

export async function loadAllContractsBoard(): Promise<ContractsBoardData> {
  const [{ fanOutAllCharacters }, { mergeCharacterContracts }] = await Promise.all([
    import('@/features/character/allCharactersFanOut'),
    import('@/features/contracts/allContractsSnapshot'),
  ]);
  const scope = ESI_REGISTRY.getCharacterContracts.scope;
  const { entries } = await fanOutAllCharacters({
    scope,
    load: async ({ characterId, name }) => {
      const { cached, needsReauth } = await loadContracts(characterId);
      return {
        characterId,
        characterName: name,
        contracts: cached?.data ?? [],
        needsReauth,
        truncated: cached?.truncated ?? false,
        fetchedAt: cached?.fetchedAt.getTime() ?? 0,
        fromCache: cached?.fromCache ?? false,
      };
    },
  });
  if (entries.length === 0) {
    if (!(await nobodyGranted(scope))) throw new Error('Contracts could not be read');
    return {
      summary: summarizeContractsBoard([], 0, Date.now()),
      route: null,
      needsReauth: true,
      fetchedAt: null,
    };
  }
  const read = entries.filter((entry) => entry.fetchedAt > 0);
  if (read.length === 0 && !entries.some((entry) => entry.needsReauth)) {
    throw new Error('Contracts could not be read');
  }
  const { contracts } = mergeCharacterContracts(entries);
  return contractsBoardOf(
    contracts,
    new Set(entries.map((entry) => entry.characterId)),
    entries[0]!.characterId,
    read.length === 0,
    read.length === 0 ? null : new Date(Math.min(...read.map((entry) => entry.fetchedAt)))
  );
}

async function contractsBoardOf(
  contracts: readonly Contract[],
  pilot: number | ReadonlySet<number>,
  lookupCharacterId: number,
  needsReauth: boolean,
  fetchedAt: Date | null
): Promise<ContractsBoardData> {
  const loadedAt = Date.now();
  const summary = summarizeContractsBoard(contracts, pilot, loadedAt);
  const { soonest } = summary;
  const routes: Record<number, readonly [string, string]> = {};
  await Promise.all(
    summary.rows
      .filter((item) => item.kind === 'courier')
      .slice(0, 12)
      .map(async (item) => {
        const { startLocationId, endLocationId } = item;
        if (!startLocationId || !endLocationId) return;
        try {
          const [from, to] = await Promise.all([
            loadContractLocationName(lookupCharacterId, startLocationId),
            loadContractLocationName(lookupCharacterId, endLocationId),
          ]);
          if (from && to) routes[item.contractId] = [from, to];
        } catch {}
      })
  );
  const soonestRoute = soonest ? routes[soonest.contractId] : undefined;
  const route = soonestRoute ? `${soonestRoute[0]} → ${soonestRoute[1]}` : null;
  return { summary, route, routes, needsReauth, fetchedAt };
}

export interface SpExtractionBoardData {
  totalSp: number | null;
  monitoring: boolean;
  thresholdSp: number;
  price?: { hubName: string; loaded: boolean; net: number | null };
}

export interface BoardMail {
  mailId: number;
  subject: string;
  from: string | null;
  atMs: number | null;
  unread?: boolean;
  ownerId?: number;
}

export interface MailBoardData {
  unread: number;
  recent: BoardMail[];
  inbox?: BoardMail[];
  needsReauth: boolean;
  fetchedAt: Date | null;
}

export async function loadMailBoard(characterId: number): Promise<MailBoardData> {
  const [labels, headers] = await Promise.all([
    loadMailLabels(characterId),
    loadMailHeaders(characterId),
  ]);
  if (!labels.cached && !headers.cached && !labels.needsReauth && !headers.needsReauth) {
    throw new Error('Mail could not be read');
  }
  const newestFirst = (headers.cached?.data ?? [])
    .map((header) => ({
      header,
      atMs: header.timestamp ? Date.parse(header.timestamp) : Number.NaN,
    }))
    .sort((a, b) => (Number.isNaN(b.atMs) ? -1 : b.atMs) - (Number.isNaN(a.atMs) ? -1 : a.atMs));
  const unreadHeaders = newestFirst
    .filter(({ header }) => header.is_read === false)
    .slice(0, RECENT_ROWS);
  const inboxHeaders = newestFirst.slice(0, INBOX_ROWS);
  const senderIds = [...new Set([...unreadHeaders, ...inboxHeaders])].flatMap(({ header }) =>
    header.from === undefined ? [] : [header.from]
  );
  let names = new Map<number, string>();
  if (senderIds.length > 0) {
    try {
      names = await resolveNames(senderIds);
    } catch {}
  }
  const boardMail = ({ header, atMs }: (typeof newestFirst)[number]): BoardMail => ({
    mailId: header.mail_id,
    subject: header.subject ?? '',
    from: header.from === undefined ? null : (names.get(header.from) ?? null),
    atMs: Number.isNaN(atMs) ? null : atMs,
    unread: header.is_read === false,
    ownerId: characterId,
  });
  return {
    unread:
      labels.cached?.data.total_unread_count ??
      (headers.cached?.data ?? []).filter((header) => header.is_read === false).length,
    recent: unreadHeaders.map(boardMail),
    inbox: inboxHeaders.map(boardMail),
    needsReauth: headers.needsReauth || labels.needsReauth,
    fetchedAt:
      [headers.cached?.fetchedAt, labels.cached?.fetchedAt]
        .filter((date): date is Date => date instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  };
}

async function nobodyGranted(scope: string): Promise<boolean> {
  return (await characterIdsWithScopes([scope])).length === 0;
}

export async function loadAllMailBoard(): Promise<MailBoardData> {
  const { fanOutAllCharacters } = await import('@/features/character/allCharactersFanOut');
  const scope = ESI_REGISTRY.getCharacterMailHeaders.scope;
  const { entries } = await fanOutAllCharacters<MailBoardData>({
    scope,
    load: ({ characterId }) => loadMailBoard(characterId),
  });
  if (entries.length === 0) {
    if (await nobodyGranted(scope)) {
      return { unread: 0, recent: [], inbox: [], needsReauth: true, fetchedAt: null };
    }
    throw new Error('Mail could not be read');
  }
  return mergeMailBoards(entries);
}

export interface PriceAlertsBoardData {
  alerts: BoardPriceAlert[];
  checkedAt: number | null;
}

export async function loadPriceAlertsBoard(characterId: number): Promise<PriceAlertsBoardData> {
  const [record, snapshot] = await Promise.all([
    db.quickbars.get(String(characterId)),
    lastPriceAlertSnapshot(characterId),
  ]);
  const alerts = buildPriceAlertRows(record?.items ?? [], snapshot);
  const hub = getTradeHub(await tradeHubIdFor(characterId, 'market')) ?? DEFAULT_TRADE_HUB;
  const typeIds = [...new Set(alerts.map((alert) => alert.typeId))];
  const vs90d = new Map<number, number | null>();
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
    vs90d.set(typeId, await loadPriceVsMedian(hub.regionId, typeId));
  });
  return {
    alerts: alerts.map((alert) => ({ ...alert, vs90d: vs90d.get(alert.typeId) ?? null })),
    checkedAt: snapshot?.nowMs ?? null,
  };
}

export interface StructuresBoardData {
  structures: BoardStructureSource[] | null;
  structureCount: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
  expiresAt?: Date;
  expiresAtByCorp?: ReadonlyMap<number, Date>;
  corporations?: ReadonlyMap<number, CorpLabel>;
  partlyFailed?: boolean;
}

export interface StructuresView extends Omit<StructuresBoardData, 'structures'> {
  items: CorpBoardItem[] | null;
}

export async function loadStructuresBoard(characterId: number): Promise<StructuresBoardData> {
  const { loadStructuresBoardData } = await import('./corpBoard');
  return loadStructuresBoardData(characterId);
}

export async function loadAllStructuresBoard(): Promise<StructuresBoardData> {
  const { loadAllStructuresBoardData } = await import('./corpBoard');
  return loadAllStructuresBoardData();
}

export interface MoonChunksBoardData {
  chunks: BoardClockSource[] | null;
  extractions?: BoardExtractionSource[];
  needsReauth: boolean;
  fetchedAt: Date | null;
  loadedAt: number;
  fromBook?: true;
  shareMarks?: Readonly<Record<string, PopShareMark>>;
  partlyFailed?: boolean;
}

export async function loadMoonChunksBoard(characterId: number): Promise<MoonChunksBoardData> {
  const { loadMoonChunksWithBook } = await import('./corpBoard');
  return loadMoonChunksWithBook(characterId);
}

export async function loadAllMoonChunksBoard(): Promise<MoonChunksBoardData> {
  const { loadAllMoonChunksBoardData } = await import('./corpBoard');
  return loadAllMoonChunksBoardData();
}
