/**
 * What the Overview board reads, per card.
 *
 * Each loader is a thin composition over the loader its own page already uses
 * — never a second way of fetching the same thing (docs/ARCHITECTURE.md §7).
 * The board's job is to summarise, so the arithmetic here is counting and
 * summing; every judgement that has a rule behind it (is this order undercut,
 * is this colony idle, is this job done) comes from the engine that owns it.
 *
 * Split from the route so the route is layout: `Overview.tsx` was already 400
 * lines of panels before it grew six cards.
 */
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
import { loadContracts } from '@/features/character/contracts';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import {
  summarizeContractsBoard,
  type ContractsBoardSummary,
} from '@/engine/contracts/contractsBoard';
import { loadMailHeaders, loadMailLabels } from '@/features/character/mail';
import { resolveNames } from '@/features/character/names';
import { db } from '@/db';
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

/*
 * `Overview` is the landing route and stays in the entry chunk (every other
 * route is code-split, `app/routeChunks.ts`), so anything this module names
 * statically is in the first paint's graph. Two rules follow:
 *
 * - The PI fetch layer (`pi/data`, `pi/names`) and
 *   `character/typeNames` are imported statically. The boot graph already
 *   holds them — `app/prefetch.ts`, the notification poller and the Calendar
 *   route warmer all name them — so an `import()` here cannot move them out
 *   of the entry chunk; Rollup reports it as an ineffective dynamic import.
 * - `miningTax/snapshot` stays behind `import()`, and so does `miningTax/owedNow`
 *   (the Tax tab's owed figure, Corp Tax Books included). It reaches the ledger,
 *   payees, assignments, reconciliation and `sde/loadSde` for two numbers,
 *   and its only other importer is the code-split Mining page, so deferring
 *   it genuinely keeps that chain off the first paint. The card was going to
 *   wait for a network round trip anyway.
 */

// --- Planetary ------------------------------------------------------------

export interface BoardColony {
  planetId: number;
  /** Null until the public planet-name read lands; the row falls back to the id. */
  name: string | null;
  status: ColonyStatus;
  /** Extractor programs on the colony; absent on data built before the widget read it. */
  programCount?: number;
}

export interface PlanetaryBoardData {
  batches: ColonyBatch<BoardColony>[];
  colonyCount: number;
  /** Extractor programs across every colony — the footer's second figure. */
  programCount: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
  /** The instant the statuses were computed against, so the view's countdowns agree with them. */
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

/**
 * The active Character's colonies, batched into reset runs.
 *
 * Runs the same live detail load the Planetary Industry route does rather than
 * reading cache only: expiry is one of the two things this board exists to
 * answer, and "8 colonies, timers unknown" would be a card not worth the
 * space. `loadAllColonyDetails` is concurrency-capped at 3 and every read is
 * ESI-cached, so a return visit costs nothing.
 */
export async function loadPlanetaryBoard(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<PlanetaryBoardData> {
  const { cached, needsReauth } = await loadCharacterPlanets(characterId);
  // Nothing cached and the grant is fine: the read failed, never "no colonies".
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

// --- Mining tax -----------------------------------------------------------

export interface MiningTaxBoardData {
  /** What the Tax tab's "You owe" totals across every Character (`loadOwedBalances`). */
  unpaidIsk: number;
  /** How many Payees that is spread across — "412.6M" reads differently across one and eleven. */
  payeeCount: number;
  /** Ledger entries carrying ore no Assignment covers yet. */
  unassignedCount: number;
  /** Days since the oldest owed entry, or null when nothing is owed. */
  oldestUnpaidDays: number | null;
  /**
   * No Character's ledger could be read, so the figures say nothing. One that
   * could not among others that could is only left out (`missingCharacterNames`).
   */
  needsReauth: boolean;
  fetchedAt: Date | null;
  /** Who is owed what, the most owed first. Absent in a snapshot cached before this field existed. */
  payees?: PayeeOwed[];
  /** Every Character on the account. */
  characterCount: number;
  /** Characters whose ledger could not be read (re-auth), so the figures leave them out. */
  missingCharacterNames: string[];
  /** The same Characters' ids, for the grant to ask. Absent in a snapshot cached before this field existed. */
  missingCharacterIds?: number[];
}

export async function loadMiningTaxBoard(): Promise<MiningTaxBoardData> {
  const [{ loadMoonMiningTaxSnapshot }, { loadOwedBalances }] = await Promise.all([
    import('@/features/miningTax/snapshot'),
    import('@/features/miningTax/owedNow'),
  ]);
  const snapshot = await loadMoonMiningTaxSnapshot();
  const now = Date.now();
  // The Tax tab's "You owe" figure, Corp Tax Book overlay and all, so the two never disagree.
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

// --- Industry -------------------------------------------------------------

/** One Character's job-slot inputs: free / max per pool is worked out at build time, against the clock. */
export interface IndustryCharacterSlots {
  characterId: number;
  characterName: string;
  skills: JobSlotSkills;
  jobs: JobSlotJob[];
}

export interface IndustryBoardData {
  /** The header Character's jobs. */
  jobs: IndustryJob[];
  /** Every Character's jobs, the header Character's included, for a widget on All characters. */
  allJobs?: IndustryJob[];
  /** Job-slot inputs per Character whose skills and jobs are both known; never a guessed zero. */
  slots?: IndustryCharacterSlots[];
  /**
   * What each job is making, keyed by job id. A row saying "2 runs" names
   * nothing you can act on — the product is the whole point of the row, and it
   * is what the Industry page's own rows lead with.
   */
  productNames: Map<number, string>;
  /**
   * Where each job sits (its `station_id`), by that id. Best effort: a
   * location that does not resolve is simply absent, and the Table view drops
   * its Location column when none resolved.
   */
  locationNames?: Map<number, string>;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

/** A pilot's jobs sit in a handful of places; naming more than this is not worth the reads. */
const MAX_JOB_LOCATIONS = 6;

/** Each fanned-out Character's slot inputs; one whose skills don't load is left out. */
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
      } catch {
        // Unknown skills read as "no slot row", never a guessed zero.
      }
    }
  );
  return slots.filter((row): row is IndustryCharacterSlots => row !== null);
}

export async function loadIndustryBoard(characterId: number): Promise<IndustryBoardData> {
  // Every Character's jobs at once (the widget can sum across them); the
  // header Character's own read is reused from the fan-out when it is in it.
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
  // The header Character's jobs as its own view shows them (stale cache
  // included), then everyone else's.
  const allJobs = [
    ...jobs,
    ...known.filter((entry) => entry.characterId !== characterId).flatMap((entry) => entry.jobs),
  ];
  const slots = await loadIndustrySlots(known);

  // Blueprint id as the fallback: research and copying jobs have no product,
  // and "Ishtar Blueprint" is still the right thing to call that row.
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

// --- Contracts ------------------------------------------------------------

export interface ContractsBoardData {
  summary: ContractsBoardSummary;
  /** "Jita → Amarr" for the soonest courier, or null when it is not a courier or the names did not resolve. */
  route: string | null;
  /** The same for every courier in `summary.rows`, by contract id: `[from, to]` full location names. */
  routes?: Record<number, readonly [string, string]>;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

/**
 * Only the deadline-relevant subset of the pilot's contracts (`engine/contractsBoard`).
 * The route name is a courtesy: a lookup that fails leaves the note without one.
 */
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

/**
 * Every Character's contracts as one board: each contract once (one between two of your
 * Characters is not counted twice), read by the Characters that hold the contracts scope.
 */
export async function loadAllContractsBoard(): Promise<ContractsBoardData> {
  const [{ fanOutAllCharacters }, { mergeCharacterContracts }] = await Promise.all([
    import('@/features/character/allCharactersFanOut'),
    import('@/features/contracts/allContractsSnapshot'),
  ]);
  const { entries, skipped } = await fanOutAllCharacters({
    scope: ESI_REGISTRY.getCharacterContracts.scope,
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
  const read = entries.filter((entry) => entry.fetchedAt > 0);
  if (read.length === 0 && entries.length === 0 && skipped.length > 0) {
    // Nobody granted the contracts scope: a permission to ask for, never "no contracts".
    return {
      summary: summarizeContractsBoard([], 0, Date.now()),
      route: null,
      needsReauth: true,
      fetchedAt: null,
    };
  }
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

/**
 * The board over `contracts` as seen by `pilot`; `lookupCharacterId` is the Character whose
 * token resolves a courier's location names (any of them can: names are public).
 */
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
  // Names are cached lookups; a failed one leaves that row without a route, never the board.
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
        } catch {
          // A courtesy: the row names the contract without a route.
        }
      })
  );
  const soonestRoute = soonest ? routes[soonest.contractId] : undefined;
  const route = soonestRoute ? `${soonestRoute[0]} → ${soonestRoute[1]}` : null;
  return { summary, route, routes, needsReauth, fetchedAt };
}

// --- SP extraction ----------------------------------------------------------

/**
 * Not a loader of its own: the total comes from the skills read the summary
 * strip already makes, and the switch and threshold are the synced SP
 * Extraction preferences (`features/character/spExtractionSettings.ts`).
 */
export interface SpExtractionBoardData {
  /** Null until the skills read lands. */
  totalSp: number | null;
  /** Whether the pilot turned SP Extraction monitoring on. Off, nothing is ever flagged. */
  monitoring: boolean;
  thresholdSp: number;
  /** Net ISK per extraction at the saved hub; `loaded` false while the hub answers. */
  price?: { hubName: string; loaded: boolean; net: number | null };
}

// --- Mail -------------------------------------------------------------------

/** Mail rows the Table view can show at its tallest size. */
const INBOX_ROWS = 12;

export interface BoardMail {
  mailId: number;
  subject: string;
  /** Null when the sender's name did not resolve; the row leaves it out. */
  from: string | null;
  atMs: number | null;
  /** Set on `inbox` rows: false for mail already read. */
  unread?: boolean;
}

export interface MailBoardData {
  /** ESI's own unread total across the mailbox, not just the 50 newest headers. */
  unread: number;
  /** The newest unread mails, newest first — a few rows, not the inbox. */
  recent: BoardMail[];
  /** The newest mail, read or not, newest first: the Table view's rows. */
  inbox?: BoardMail[];
  needsReauth: boolean;
  fetchedAt: Date | null;
}

/**
 * The count comes from the labels read, whose `total_unread_count` covers the
 * whole mailbox; the headers only reach the 50 newest, so counting unread
 * among them would under-report a backlog. The headers supply the rows.
 */
export async function loadMailBoard(characterId: number): Promise<MailBoardData> {
  const [labels, headers] = await Promise.all([
    loadMailLabels(characterId),
    loadMailHeaders(characterId),
  ]);
  // Neither read landed and the grant is fine: unknown, never "0 unread".
  if (!labels.cached && !headers.cached && !labels.needsReauth && !headers.needsReauth) {
    throw new Error('Mail could not be read');
  }
  const newestFirst = (headers.cached?.data ?? [])
    .map((header) => ({
      header,
      atMs: header.timestamp ? Date.parse(header.timestamp) : Number.NaN,
    }))
    .sort((a, b) => (Number.isNaN(b.atMs) ? -1 : b.atMs) - (Number.isNaN(a.atMs) ? -1 : a.atMs));
  const unreadHeaders = newestFirst.filter(({ header }) => header.is_read === false).slice(0, 4);
  const inboxHeaders = newestFirst.slice(0, INBOX_ROWS);
  const senderIds = [...new Set([...unreadHeaders, ...inboxHeaders])].flatMap(({ header }) =>
    header.from === undefined ? [] : [header.from]
  );
  let names = new Map<number, string>();
  if (senderIds.length > 0) {
    try {
      names = await resolveNames(senderIds);
    } catch {
      // A courtesy: a row without a sender still names the mail.
    }
  }
  const boardMail = ({ header, atMs }: (typeof newestFirst)[number]): BoardMail => ({
    mailId: header.mail_id,
    subject: header.subject ?? '',
    from: header.from === undefined ? null : (names.get(header.from) ?? null),
    atMs: Number.isNaN(atMs) ? null : atMs,
    unread: header.is_read === false,
  });
  return {
    unread:
      labels.cached?.data.total_unread_count ??
      (headers.cached?.data ?? []).filter((header) => header.is_read === false).length,
    recent: unreadHeaders.map(boardMail),
    inbox: inboxHeaders.map(boardMail),
    needsReauth: headers.needsReauth || labels.needsReauth,
    // The older of the two reads: the count is only as fresh as the labels.
    fetchedAt:
      [headers.cached?.fetchedAt, labels.cached?.fetchedAt]
        .filter((date): date is Date => date instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  };
}

// --- Price alerts -----------------------------------------------------------

export interface PriceAlertsBoardData {
  alerts: BoardPriceAlert[];
  /** When the poller last priced these targets, or null if it never has. */
  checkedAt: number | null;
}

/**
 * The Quickbar's targets, priced from the poller's last reading
 * (`priceAlertsBoard.ts`), each with its price vs 90-day median in the
 * region of the Trade Hub the poller prices at.
 */
export async function loadPriceAlertsBoard(characterId: number): Promise<PriceAlertsBoardData> {
  const [record, snapshot] = await Promise.all([
    db.quickbars.get(String(characterId)),
    lastPriceAlertSnapshot(characterId),
  ]);
  const alerts = buildPriceAlertRows(record?.items ?? [], snapshot);
  // The hub the poller prices alerts at: the Market page hub.
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

// --- Corp: structures and moon extractions -----------------------------------

/*
 * Both corp cards load through `./corpBoard`, behind `import()` like
 * `miningTax/snapshot`: the corp reads, role checks and board engine are for
 * the few pilots with corp roles, and the landing route's first paint should
 * not carry them for everyone else.
 */

export interface StructuresBoardData {
  /**
   * The corporation's structures as the corp engine reads them, or null when
   * this Character may not read structures — which is different from owning
   * none. Raw sources rather than built items: the items' clocks and
   * staleness are relative to *now*, so they are built at render time
   * (`corpCards.ts`'s `structuresView`), never frozen at load.
   */
  structures: BoardStructureSource[] | null;
  structureCount: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
  /** ESI's `Expires` for this read, when stored: dates EVE's read (`eveReadAtMs`). */
  expiresAt?: Date;
  /** Read across several corporations (All scope): each one's `expiresAt`, by corporation id. */
  expiresAtByCorp?: ReadonlyMap<number, Date>;
  /** Read across several corporations (All scope): each one's ticker and name, for its rows. */
  corporations?: ReadonlyMap<number, CorpLabel>;
  /** Read across several corporations, and one of them failed: the rest draws, flagged. */
  partlyFailed?: boolean;
}

/** `StructuresBoardData` with its items built against the current instant. */
export interface StructuresView extends Omit<StructuresBoardData, 'structures'> {
  items: CorpBoardItem[] | null;
}

export async function loadStructuresBoard(characterId: number): Promise<StructuresBoardData> {
  const { loadStructuresBoardData } = await import('./corpBoard');
  return loadStructuresBoardData(characterId);
}

/** Every readable corporation's structures, merged: a widget scoped to All characters reads this. */
export async function loadAllStructuresBoard(): Promise<StructuresBoardData> {
  const { loadAllStructuresBoardData } = await import('./corpBoard');
  return loadAllStructuresBoardData();
}

export interface MoonChunksBoardData {
  /** One clock per drill (arrival, or decay once landed), or null when unreadable. */
  chunks: BoardClockSource[] | null;
  /**
   * The same drills as the corp board ranks them (arrival and natural decay
   * both known), for the Corp Board's Due soon; absent when unreadable.
   */
  extractions?: BoardExtractionSource[];
  needsReauth: boolean;
  fetchedAt: Date | null;
  loadedAt: number;
  /** Read from a Corp Tax Book (a moon owner's pops, #6116), not from ESI. */
  fromBook?: true;
  /**
   * The Corp Tax Books' Pop Sharing marks by refinery (#6226): a drill's `id` is its refinery,
   * so its row shows whether the book shares that moon's pops.
   */
  shareMarks?: Readonly<Record<string, PopShareMark>>;
  /** Read across several corporations, and one of them failed: the rest draws, flagged. */
  partlyFailed?: boolean;
}

/** One Character's moon drills, with its Corp Tax Book's moon owners' pops (#6116). */
export async function loadMoonChunksBoard(characterId: number): Promise<MoonChunksBoardData> {
  const { loadMoonChunksWithBook } = await import('./corpBoard');
  return loadMoonChunksWithBook(characterId);
}

/** Every readable corporation's moon drills, merged: a widget scoped to All characters reads this. */
export async function loadAllMoonChunksBoard(): Promise<MoonChunksBoardData> {
  const { loadAllMoonChunksBoardData } = await import('./corpBoard');
  return loadAllMoonChunksBoardData();
}
