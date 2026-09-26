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
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import type { IndustryJob } from '@/esi/endpoints';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadAllColonyDetails, loadCharacterPlanets } from '@/features/pi/data';
import { loadPlanetName } from '@/features/pi/names';
import { extractorProgramsFromPins } from '@/features/pi/adapters';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadContracts } from '@/features/character/contracts';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import { summarizeContractsBoard, type ContractsBoardSummary } from '@/engine/contractsBoard';

/*
 * `Overview` is the landing route and stays in the entry chunk (every other
 * route is code-split, `app/routeChunks.ts`), so anything this module names
 * statically is in the first paint's graph. Two rules follow:
 *
 * - The PI fetch layer (`pi/data`, `pi/names`, `pi/adapters`) and
 *   `character/typeNames` are imported statically. The boot graph already
 *   holds them — `app/prefetch.ts`, the notification poller and the Calendar
 *   route warmer all name them — so an `import()` here cannot move them out
 *   of the entry chunk; Rollup reports it as an ineffective dynamic import.
 * - `miningTax/snapshot` stays behind `import()`. It reaches the ledger,
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
  /** Sum of `taxOwed` across every still-Outstanding Assignment. */
  unpaidIsk: number;
  /** How many Payees that is spread across — "412.6M" reads differently across one and eleven. */
  payeeCount: number;
  /** Ledger entries carrying ore no Assignment covers yet. */
  unassignedCount: number;
  /** Days since the oldest outstanding Assignment's entry, or null when nothing is owed. */
  oldestUnpaidDays: number | null;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

export async function loadMiningTaxBoard(): Promise<MiningTaxBoardData> {
  const { loadMoonMiningTaxSnapshot } = await import('@/features/miningTax/snapshot');
  const snapshot = await loadMoonMiningTaxSnapshot();
  const now = Date.now();

  let unpaidIsk = 0;
  let unassignedCount = 0;
  let oldestUnpaidMs: number | null = null;
  const payees = new Set<string>();

  for (const row of snapshot.rows) {
    if (row.unassignedOreLines.length > 0) unassignedCount += 1;
    for (const assignment of row.assignments) {
      if (assignment.status !== 'outstanding') continue;
      unpaidIsk += assignment.taxOwed;
      if (assignment.payeeId) payees.add(assignment.payeeId);
      const entryMs = Date.parse(row.entry.date);
      if (!Number.isNaN(entryMs) && (oldestUnpaidMs === null || entryMs < oldestUnpaidMs)) {
        oldestUnpaidMs = entryMs;
      }
    }
  }

  return {
    unpaidIsk,
    payeeCount: payees.size,
    unassignedCount,
    oldestUnpaidDays:
      oldestUnpaidMs === null ? null : Math.floor((now - oldestUnpaidMs) / 86_400_000),
    needsReauth: snapshot.reauthCharacters.length > 0,
    fetchedAt: snapshot.fetchedAt,
  };
}

// --- Industry -------------------------------------------------------------

export interface IndustryBoardData {
  jobs: IndustryJob[];
  /**
   * What each job is making, keyed by job id. A row saying "2 runs" names
   * nothing you can act on — the product is the whole point of the row, and it
   * is what the Industry page's own rows lead with.
   */
  productNames: Map<number, string>;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

export async function loadIndustryBoard(characterId: number): Promise<IndustryBoardData> {
  const { cached, needsReauth } = await loadCharacterIndustryJobs(characterId);
  const jobs = cached?.data ?? [];

  // Blueprint id as the fallback: research and copying jobs have no product,
  // and "Ishtar Blueprint" is still the right thing to call that row.
  const typeIds = jobs.map((job) => job.product_type_id ?? job.blueprint_type_id);
  const names = typeIds.length > 0 ? await loadTypeNames(typeIds) : new Map<number, string>();
  const productNames = new Map<number, string>();
  for (const job of jobs) {
    const name = names.get(job.product_type_id ?? job.blueprint_type_id);
    if (name !== undefined) productNames.set(job.job_id, name);
  }

  return {
    jobs,
    productNames,
    needsReauth,
    fetchedAt: cached ? cached.fetchedAt : null,
  };
}

// --- Contracts ------------------------------------------------------------

export interface ContractsBoardData {
  summary: ContractsBoardSummary;
  /** "Jita → Amarr" for the soonest courier, or null when it is not a courier or the names did not resolve. */
  route: string | null;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

/**
 * Only the deadline-relevant subset of the pilot's contracts (`engine/contractsBoard`).
 * The route name is a courtesy: a lookup that fails leaves the note without one.
 */
export async function loadContractsBoard(characterId: number): Promise<ContractsBoardData> {
  const { cached, needsReauth } = await loadContracts(characterId);
  const loadedAt = Date.now();
  const summary = summarizeContractsBoard(cached?.data ?? [], characterId, loadedAt);
  const { soonest } = summary;
  let route: string | null = null;
  if (soonest?.kind === 'courier' && soonest.startLocationId && soonest.endLocationId) {
    try {
      const [from, to] = await Promise.all([
        loadContractLocationName(characterId, soonest.startLocationId),
        loadContractLocationName(characterId, soonest.endLocationId),
      ]);
      if (from && to) route = `${from} → ${to}`;
    } catch {
      route = null;
    }
  }
  return { summary, route, needsReauth, fetchedAt: cached ? cached.fetchedAt : null };
}
