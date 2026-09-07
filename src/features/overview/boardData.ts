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

/*
 * The fetch layers below are `import()`ed inside the loaders that use them,
 * not at the top of this file, and that is about the *landing route*.
 *
 * `Overview` is imported eagerly by `App.tsx` — it is what the app opens on —
 * so anything this module names statically lands in the graph the browser must
 * pull and the dev server must transform before the first paint of any page,
 * login included. Two of these chains are large out of proportion to what the
 * board shows: `miningTax/snapshot` reaches the ledger, payees, assignments,
 * reconciliation and `sde/loadSde` for two numbers, and `pi/data` reaches the
 * colony detail fan-out for four rows.
 *
 * Every one of them is already behind an `async` loader that runs after mount,
 * so deferring costs nothing at the point of use — the card was going to wait
 * for a network round trip anyway.
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
  const { loadAllColonyDetails, loadCharacterPlanets } = await import('@/features/pi/data');
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

  const [{ loadPlanetName }, { extractorProgramsFromPins }] = await Promise.all([
    import('@/features/pi/names'),
    import('@/features/pi/adapters'),
  ]);
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
  const names =
    typeIds.length > 0
      ? await import('@/features/character/typeNames').then((m) => m.loadTypeNames(typeIds))
      : new Map<number, string>();
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
