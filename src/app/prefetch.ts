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
 *   can be 20+ pages. The run is capped at `ESI_FANOUT_CONCURRENCY`, the one
 *   fan-out policy (`lib/concurrency.ts`), shared with the roster and PI
 *   detail fan-outs.
 */
import { db } from '@/db';
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { usePrefetch } from '@/stores/prefetch';
import {
  loadCharacterSkills,
  loadCharacterAttributes,
  loadCharacterImplants,
  loadCharacterSkillQueue,
} from '@/features/skills/data';
import {
  loadWalletBalance,
  loadWalletJournal,
  loadWalletTransactions,
} from '@/features/character/wallet';
import { loadCharacterAssets } from '@/features/character/assets';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import { loadContracts } from '@/features/character/contracts';
import { loadMailHeaders, loadMailLabels } from '@/features/character/mail';
import { loadCalendarEvents } from '@/features/character/calendar';
import { loadContacts } from '@/features/character/contacts';
import { loadCharacterClones } from '@/features/character/clones';
import { loadEmploymentHistory } from '@/features/character/employmentHistory';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
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
    endpoints: ['getCharacterIndustryJobs'],
    run: loadCharacterIndustryJobs,
  },
  {
    id: 'orders',
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
    endpoints: ['getCharacterContacts'],
    run: loadContacts,
  },
  {
    id: 'contracts',
    endpoints: ['getCharacterContracts'],
    run: loadContracts,
  },
  {
    id: 'order-history',
    endpoints: ['getCharacterOrderHistory'],
    run: loadOrderHistory,
  },
  {
    id: 'blueprints',
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
      await loadAllColonyDetails(characterId, planetIds);
    },
  },
  {
    id: 'wallet-journal',
    endpoints: ['getCharacterWalletJournal'],
    run: loadWalletJournal,
  },
  {
    id: 'wallet-transactions',
    endpoints: ['getCharacterWalletTransactions'],
    run: loadWalletTransactions,
  },
  {
    // Last on purpose: the one task that can be tens of requests on its own.
    id: 'assets',
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
  return tasks.filter((task) =>
    task.endpoints.every((endpoint) => {
      const { scope } = ESI_REGISTRY[endpoint];
      return !isScopeRequired(scope) || held.has(scope);
    })
  );
}

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
  signal: PrefetchSignal = { cancelled: false }
): Promise<void> {
  const token = await db.tokens.get(characterId);
  // No token row is no grant at all, not a permissive default — same reading
  // `useGrantedScopes` gives it.
  const tasks = prefetchTasksFor(token?.scopes ?? []);
  if (signal.cancelled || tasks.length === 0) return;

  const { begin, advance, finish } = usePrefetch.getState();
  begin(tasks.length);
  try {
    await mapWithConcurrencyLimit(tasks, ESI_FANOUT_CONCURRENCY, async (task) => {
      if (signal.cancelled) return;
      try {
        await task.run(characterId);
      } catch {
        // Swallowed by design; see the doc comment above.
      }
      advance();
    });
  } finally {
    finish();
  }
}
