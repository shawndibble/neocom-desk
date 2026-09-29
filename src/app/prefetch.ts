/**
 * Boot-time cache warm-up: on app start and on every Character switch, pull
 * every API-derived surface into the Dexie `esiCache` table up front, so a page
 * the user opens later renders from local data instead of waiting on ESI.
 *
 * It is a thin orchestrator, not a second fetch layer — every task calls the
 * same `features/*` loader the view itself calls, so cache keys, auth policies
 * and truncation rules have exactly one definition. That also makes the whole
 * run idempotent for free: a loader whose row is inside its freshness window
 * (`esi/cache.ts`'s `STALE_AFTER`) returns the row and never touches the
 * network, so warming twice inside ten minutes costs one Dexie read per task.
 *
 * Two things it must not do:
 * - **Fetch what the Character never granted.** A blind call to a scope-gated
 *   endpoint answers 403, which `esi/cache.ts` reports to the shell-wide
 *   re-auth notice — so an unfiltered warm-up would paint that banner at boot
 *   for every user who hasn't granted all of them. `prefetchTasksFor` filters
 *   the task list against the stored grant, the same comparison
 *   `routeScopes.ts` makes per route.
 * - **Burst.** ESI bills against a global error-limit budget, and assets alone
 *   can be 20+ pages. The run is capped at {@link PREFETCH_CONCURRENCY} — well
 *   under the app-wide ESI ceiling (`esi/budget.ts`), because it runs beside
 *   the visible route and must leave that route most of the permits.
 *
 * Loaded on demand (`bootPrefetch.ts`), not imported by the shell: it pulls in
 * a loader from nearly every feature, none of which the first paint needs.
 */
import { db } from '@/db';
import { isCacheFresh } from '@/esi/cache';
import { inBackgroundLane } from '@/esi/lane';
import type { EsiEndpointId } from '@/esi/registry';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { usePrefetch } from '@/stores/prefetch';
import { grantCovers } from './grantCovers';
import {
  loadCharacterSkills,
  loadCharacterAttributes,
  loadCharacterImplants,
  loadCharacterSkillQueue,
} from '@/features/skills/data';
import {
  KEYS as WALLET_KEYS,
  loadWalletBalance,
  loadWalletJournal,
  loadWalletTransactions,
} from '@/features/character/wallet';
import { KEY as ASSETS_KEY, loadCharacterAssets } from '@/features/character/assets';
import { KEYS as ORDER_KEYS, loadOrders, loadOrderHistory } from '@/features/character/orders';
import { KEY as CONTRACTS_KEY, loadContracts } from '@/features/character/contracts';
import { loadMailHeaders, loadMailLabels } from '@/features/character/mail';
import { loadCalendarEvents } from '@/features/character/calendar';
import { loadContacts } from '@/features/character/contacts';
import { loadCharacterStandings } from '@/features/character/standings';
import { loadCharacterClones } from '@/features/character/clones';
import { loadEmploymentHistory } from '@/features/character/employmentHistory';
import { KEY as BLUEPRINTS_KEY, loadCharacterBlueprints } from '@/features/industry/data';
import { KEYS as JOB_KEYS, loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';

export interface PrefetchTask {
  /** Stable identifier — the unit of progress, and what a test names. */
  readonly id: string;
  /**
   * Every ESI endpoint the task reaches. The scope gate reads their
   * requirements from `ESI_REGISTRY` rather than restating any scope string,
   * so an endpoint that changes scope upstream re-gates this table for free.
   */
  readonly endpoints: readonly EsiEndpointId[];
  readonly run: (characterId: number) => Promise<unknown>;
  /**
   * The one `esiCache` key `run` reads through, on the default window. When
   * set, a row still fresh by its meta skips the task outright: `run` would
   * only have read that row back — deserializing the whole value (megabytes,
   * for assets or a journal) for a warm-up that throws it away. Only for a
   * task that is a single loader call over exactly this key; imported from
   * the feature so the two cannot drift.
   */
  readonly cacheKey?: string;
}

/**
 * Ordered cheapest-and-most-visible first. Concurrency is bounded, so this
 * order is a priority: Overview's own reads should land before the multi-page
 * asset and journal walks that a given session may never open.
 *
 * Adding a task here also means adding its route to `e2e/support/mockEsi.ts`
 * (`PREFETCHED_EMPTY`): the e2e network guard fails any spec that lets a real
 * request escape, and boot now reads all of these before a spec does anything.
 */
export const PREFETCH_TASKS: readonly PrefetchTask[] = [
  {
    id: 'skills',
    endpoints: ['getCharacterSkills'],
    run: loadCharacterSkills,
  },
  {
    id: 'skillqueue',
    endpoints: ['getCharacterSkillQueue'],
    run: loadCharacterSkillQueue,
  },
  {
    id: 'attributes',
    endpoints: ['getCharacterAttributes'],
    run: loadCharacterAttributes,
  },
  {
    id: 'implants',
    endpoints: ['getCharacterImplants'],
    run: loadCharacterImplants,
  },
  {
    id: 'wallet-balance',
    endpoints: ['getCharacterWallet'],
    run: loadWalletBalance,
  },
  {
    id: 'industry-jobs',
    cacheKey: JOB_KEYS.jobs,
    endpoints: ['getCharacterIndustryJobs'],
    run: loadCharacterIndustryJobs,
  },
  {
    id: 'orders',
    cacheKey: ORDER_KEYS.open,
    endpoints: ['getCharacterOrders'],
    run: loadOrders,
  },
  {
    id: 'mail-labels',
    endpoints: ['getCharacterMailLabels'],
    run: loadMailLabels,
  },
  {
    id: 'mail-headers',
    endpoints: ['getCharacterMailHeaders'],
    run: loadMailHeaders,
  },
  {
    id: 'calendar',
    endpoints: ['getCharacterCalendar'],
    run: loadCalendarEvents,
  },
  {
    id: 'clones',
    endpoints: ['getCharacterClones'],
    run: loadCharacterClones,
  },
  {
    // Public, so every Character has it — and the Character overview's
    // Employment tab has no other read, which made it the one tab that was
    // cold on first open no matter how long the session had been running.
    id: 'employment-history',
    endpoints: ['getCharacterCorporationHistory'],
    run: loadEmploymentHistory,
  },
  {
    id: 'contacts',
    endpoints: ['getCharacterContacts', 'getCharacterContactLabels'],
    run: loadContacts,
  },
  {
    // Broker-fee standings (issue #1238); warmed so a Build Plan/Open
    // Orders open with real values on first render rather than a cold fetch.
    id: 'standings',
    endpoints: ['getCharacterStandings'],
    run: loadCharacterStandings,
  },
  {
    id: 'contracts',
    cacheKey: CONTRACTS_KEY,
    endpoints: ['getCharacterContracts'],
    run: loadContracts,
  },
  {
    id: 'order-history',
    cacheKey: ORDER_KEYS.history,
    endpoints: ['getCharacterOrderHistory'],
    run: loadOrderHistory,
  },
  {
    id: 'blueprints',
    cacheKey: BLUEPRINTS_KEY,
    endpoints: ['getCharacterBlueprints'],
    run: loadCharacterBlueprints,
  },
  {
    // The colony list is one call; the per-colony detail behind it is a
    // capped fan-out `loadAllColonyDetails` already owns. Warming the list
    // alone would leave /planetary-industry doing its real work on open,
    // which is the wait this exists to remove.
    id: 'planets',
    endpoints: ['getCharacterPlanets', 'getCharacterPlanet'],
    run: async (characterId) => {
      const { cached } = await loadCharacterPlanets(characterId);
      const planetIds = (cached?.data ?? []).map((planet) => planet.planet_id);
      if (planetIds.length === 0) return;
      // After an await, so the lane `task.run` was started in has ended: the
      // colony fan-out re-enters it, or it would run foreground (issue #2271).
      await inBackgroundLane(() => loadAllColonyDetails(characterId, planetIds));
    },
  },
  {
    id: 'wallet-journal',
    cacheKey: WALLET_KEYS.journal,
    endpoints: ['getCharacterWalletJournal'],
    run: loadWalletJournal,
  },
  {
    id: 'wallet-transactions',
    cacheKey: WALLET_KEYS.transactions,
    endpoints: ['getCharacterWalletTransactions'],
    run: loadWalletTransactions,
  },
  {
    // Last on purpose: the one task that can be tens of requests on its own.
    id: 'assets',
    cacheKey: ASSETS_KEY,
    endpoints: ['getCharacterAssets'],
    run: loadCharacterAssets,
  },
];

/**
 * The tasks a Character with `granted` scopes may actually run, in table order.
 *
 * Pure, and exported for its own test: getting this wrong is not a slow page,
 * it is a spurious "log in again" banner at boot for anyone missing a scope.
 */
export function prefetchTasksFor(
  granted: readonly string[],
  tasks: readonly PrefetchTask[] = PREFETCH_TASKS
): readonly PrefetchTask[] {
  const held = new Set(granted);
  return tasks.filter((task) => grantCovers(held, task.endpoints));
}

/**
 * Tasks in flight at once. Deliberately below `ESI_FANOUT_CONCURRENCY`: a
 * warm-up is background work, and at the shared cap it held most of the
 * app-wide ESI permits while the route the user is actually looking at queued
 * behind it.
 */
export const PREFETCH_CONCURRENCY = 4;

/** Cancels a run whose Character is no longer the active one. */
export interface PrefetchSignal {
  cancelled: boolean;
}

/**
 * Warms every surface this Character has granted. Never throws and never
 * rejects: a task that fails has already done the only thing that matters —
 * left the previous cached row in place — and a warm-up is not something to
 * interrupt the user over. The view will surface a real failure when the user
 * actually opens it.
 */
export async function prefetchCharacterData(
  characterId: number,
  signal: PrefetchSignal = { cancelled: false },
  table: readonly PrefetchTask[] = PREFETCH_TASKS
): Promise<void> {
  const token = await db.tokens.get(characterId);
  // No token row is no session for this Character at all, so there is nothing
  // to warm — not even the tasks on public endpoints, which need no grant but
  // still have no reason to fire for somebody who is not signed in. (Before
  // there was a public task, `prefetchTasksFor([])` was empty and this fell
  // out for free.)
  if (token === undefined) return;
  // No *scope* is no grant, not a permissive default — same reading
  // `useGrantedScopes` gives it.
  const tasks = prefetchTasksFor(token.scopes, table);
  if (signal.cancelled || tasks.length === 0) return;

  const { begin, advance, finish } = usePrefetch.getState();
  begin(tasks.length);
  try {
    await mapWithConcurrencyLimit(tasks, PREFETCH_CONCURRENCY, async (task) => {
      if (signal.cancelled) return;
      try {
        const fresh =
          task.cacheKey !== undefined && (await isCacheFresh(characterId, task.cacheKey));
        // Background at the ESI gate (issue #2271): the warm-up yields to
        // whatever the visible page is loading.
        if (!fresh) await inBackgroundLane(() => task.run(characterId));
      } catch {
        // Swallowed by design; see the doc comment above.
      }
      advance();
    });
  } finally {
    finish();
  }
}
