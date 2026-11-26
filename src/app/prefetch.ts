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
import { KEY as ASSETS_KEY, loadCharacterAssets } from '@/features/assets/assets';
import { KEYS as ORDER_KEYS, loadOrders, loadOrderHistory } from '@/features/character/orders';
import { KEY as CONTRACTS_KEY, loadContracts } from '@/features/character/contracts';
import { loadMailHeaders, loadMailLabels, prefetchMailBodies } from '@/features/character/mail';
import { loadCalendarEvents, prefetchCalendarEventDetails } from '@/features/character/calendar';
import { loadContacts } from '@/features/character/contacts';
import { loadCharacterStandings } from '@/features/character/standings';
import { detailPrefetchAllowed } from '@/features/character/detailPrefetch';
import { KEY as LOYALTY_KEY, loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { KEYS as MINING_KEYS, loadMiningLedger } from '@/features/miningTax/ledger';
import {
  warmImplantTypes,
  warmLoyaltyStores,
  warmNames,
  warmStructureNames,
} from '@/features/character/lookupPrefetch';
import { loadCharacterClones } from '@/features/character/clones';
import { loadEmploymentHistory } from '@/features/character/employmentHistory';
import { KEY as BLUEPRINTS_KEY, loadCharacterBlueprints } from '@/features/industry/data';
import { KEYS as JOB_KEYS, loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { loadGrantedScopesByCharacter } from './grantedScopes';

export interface PrefetchTask {
  readonly id: string;
  readonly endpoints: readonly EsiEndpointId[];
  readonly run: (characterId: number) => Promise<unknown>;
  readonly cacheKey?: string;
}

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
    run: async (characterId) => {
      const result = await loadMailHeaders(characterId);
      if (!result.needsReauth && result.cached !== null && !result.cached.fromCache) {
        void prefetchMailBodies(characterId, result.cached.data);
      }
      return result;
    },
  },
  {
    id: 'calendar',
    endpoints: ['getCharacterCalendar'],
    run: async (characterId) => {
      const result = await loadCalendarEvents(characterId);
      if (!result.needsReauth && result.cached !== null && !result.cached.fromCache) {
        void prefetchCalendarEventDetails(characterId, result.cached.data);
      }
      return result;
    },
  },
  {
    id: 'clones',
    endpoints: ['getCharacterClones'],
    run: loadCharacterClones,
  },
  {
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
    id: 'loyalty',
    cacheKey: LOYALTY_KEY,
    endpoints: ['getCharacterLoyaltyPoints'],
    run: loadCharacterLoyaltyPoints,
  },
  {
    id: 'mining',
    cacheKey: MINING_KEYS.ledger,
    endpoints: ['getCharacterMining'],
    run: loadMiningLedger,
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
    id: 'planets',
    endpoints: ['getCharacterPlanets', 'getCharacterPlanet'],
    run: async (characterId) => {
      const { cached } = await loadCharacterPlanets(characterId);
      const planetIds = (cached?.data ?? []).map((planet) => planet.planet_id);
      if (planetIds.length === 0) return;
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
    id: 'assets',
    cacheKey: ASSETS_KEY,
    endpoints: ['getCharacterAssets'],
    run: loadCharacterAssets,
  },
];

export const DERIVED_PREFETCH_TASKS: readonly PrefetchTask[] = [
  {
    id: 'names',
    endpoints: [],
    run: warmNames,
  },
  {
    id: 'structure-names',
    endpoints: ['getUniverseStructure'],
    run: warmStructureNames,
  },
  {
    id: 'loyalty-stores',
    endpoints: ['getCharacterLoyaltyPoints'],
    run: warmLoyaltyStores,
  },
  {
    id: 'implant-types',
    endpoints: ['getCharacterImplants'],
    run: warmImplantTypes,
  },
];

export function prefetchTasksFor(
  granted: readonly string[],
  tasks: readonly PrefetchTask[] = PREFETCH_TASKS
): readonly PrefetchTask[] {
  const held = new Set(granted);
  return tasks.filter((task) => grantCovers(held, task.endpoints));
}

export async function prefetchRosterDetails(
  activeCharacterId: number,
  signal: PrefetchSignal = { cancelled: false }
): Promise<void> {
  try {
    if (!detailPrefetchAllowed()) return;
    for (const [characterId, held] of await loadGrantedScopesByCharacter()) {
      if (signal.cancelled) return;
      if (characterId === activeCharacterId) continue;
      try {
        if (grantCovers(held, ['getCharacterCalendar', 'getCharacterCalendarEvent'])) {
          const result = await inBackgroundLane(() => loadCalendarEvents(characterId));
          if (!result.needsReauth && result.cached !== null && !result.cached.fromCache) {
            await prefetchCalendarEventDetails(characterId, result.cached.data);
          }
        }
      } catch {}
    }
  } catch {}
}

export const PREFETCH_CONCURRENCY = 4;

export interface PrefetchSignal {
  cancelled: boolean;
}

export async function prefetchCharacterData(
  characterId: number,
  signal: PrefetchSignal = { cancelled: false },
  table: readonly PrefetchTask[] = PREFETCH_TASKS,
  derivedTable: readonly PrefetchTask[] = DERIVED_PREFETCH_TASKS
): Promise<void> {
  const token = await db.tokens.get(characterId);
  if (token === undefined) return;
  const tasks = prefetchTasksFor(token.scopes, table);
  if (signal.cancelled || tasks.length === 0) return;
  const derived = prefetchTasksFor(token.scopes, derivedTable);

  const { begin, advance, finish } = usePrefetch.getState();
  begin(tasks.length + derived.length);
  try {
    await mapWithConcurrencyLimit(tasks, PREFETCH_CONCURRENCY, async (task) => {
      if (signal.cancelled) return;
      try {
        const fresh =
          task.cacheKey !== undefined && (await isCacheFresh(characterId, task.cacheKey));
        if (!fresh) await inBackgroundLane(() => task.run(characterId));
      } catch {}
      advance();
    });
    await mapWithConcurrencyLimit(derived, PREFETCH_CONCURRENCY, async (task) => {
      if (signal.cancelled) return;
      try {
        if (detailPrefetchAllowed()) await inBackgroundLane(() => task.run(characterId));
      } catch {}
      advance();
    });
  } finally {
    finish();
  }
  if (!signal.cancelled) await prefetchRosterDetails(characterId, signal);
}
