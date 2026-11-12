/**
 * The Corp Board's reads, loaded behind `import()` from `corpFeeds.ts`.
 *
 * **Gated before they fetch** (`features/corp/corpReadAccess.ts`): no corp call
 * at all unless the roles and grant cover it. CCP role-gates these endpoints
 * server-side, so an ungated read buys a guaranteed 403. Each goes through the
 * corp loaders `/corp` and its sub-pages already use, so the cache rows, the
 * corp-scoped keys and the 403 handling are theirs, not a second copy.
 */
import { diffRoster } from '@/engine/corp/members';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { planetInfo } from './spaceLookups';
import { summariseBay } from '@/engine/corp/starbases';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCorporationId, MASTER_WALLET_DIVISION } from '@/features/corp/boardData';
import { jobTypeIds } from '@/features/corp/boardSources';
import { classifyCorpAssets } from '@/engine/corp/assetLedger';
import { loadCorporationAssets, toCorpAssetInputs } from '@/features/corp/assets';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { loadAssetCopyValues } from '@/features/assets/assetCopyValues';
import { getAveragePriceByType } from '@/market/prices';
import { summariseCorpAssets } from './corpAssetsSummary';
import { loadCorporationContracts } from '@/features/corp/contracts';
import { loadCorporationOrders } from '@/features/corp/orders';
import { loadStationBestPrices } from '@/features/market/orderCompetition';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { CorpReadFailed } from '@/features/corp/corpRead';
import { readSrpClaims } from '@/features/corp/srpOfficerClient';
import { verifySrpOfficer } from '@/features/corp/srpClient';
import { readCorpFeed, UNREADABLE, unlanded } from './corpFeedRead';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { walletDivisions } from '@/features/corp/divisions';
import { loadRoleAudit } from '@/features/corp/roleAudit';
import { loadCorporationCustomsOffices } from '@/features/corp/customsOffices';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import {
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  toMemberActivity,
} from '@/features/corp/members';
import {
  loadCorporationSkyhooks,
  loadCorporationSovereigntyHubs,
  loadHubDetails,
  loadSkyhookDetails,
} from '@/features/corp/sovereignty';
import { loadCorporationStarbases, loadStarbaseDetails } from '@/features/corp/starbases';
import { readPreviousRoster } from '@/features/corp/rosterState';
import { loadObserverFeed } from '@/features/corp/taxBook/esiFeed';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { isNpcCorporationId } from '@/esi/entityIds';
import { DAY_MS } from '@/lib/age';
import {
  accountCorpReaders,
  corpReadersFor,
  loadAccountCorpAccess,
  type CorpCapability,
} from '@/features/corp/corpReadAccess';
import { loadCorpLabels } from '@/features/corp/corpTicker';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  activeReader,
  oldest,
  settleCorps,
  startFeederChunks,
  type FeederChunks,
  loadMoonChunksBoardData,
  loadStructuresBoardData,
} from '../../data/corpBoard';
import { mergeCorpRows, mergeLookups } from '@/engine/corp/corpMerge';
import type { CorpFeedBody } from './corpFeedRead';
import { fetchCorporationStatsRead } from '@/lib/zkillboard';
import { parseInstant } from '@/engine/esiInstant';
import type {
  CorpAllFeed,
  CorpAssetsFeed,
  CorpCustomsFeed,
  CorpRoleAuditFeed,
  CorpContractsFeed,
  CorpDeadlinesAllFeed,
  CorpDeadlinesSlice,
  CorpFeedBase,
  CorpJobsFeed,
  CorpJournalLine,
  CorpKillsFeed,
  CorpSrpFeed,
  CorpMembersFeed,
  CorpMiningFeed,
  CorpSovereigntyFeed,
  CorpSovereigntyRow,
  CorpStarbaseRow,
  CorpStarbasesFeed,
  CorpOrdersFeed,
  CorpWalletFeed,
} from './corpFeeds';
import type { CorpDeadlineSource } from './corpDeadlineSources';

/**
 * `withJournal: false` reads the balances only (the All scope's Divisions view): no journal
 * request, and `journal` is null, so nothing reads net or runway from it.
 */
export function loadCorpWallet(characterId: number, withJournal = true): Promise<CorpWalletFeed> {
  return readCorpFeed<CorpWalletFeed>(characterId, {
    capability: 'canReadWallet',
    empty: { divisions: [], journalDivision: MASTER_WALLET_DIVISION, journal: null },
    read: async ({ corporationId, can }) => {
      const [wallets, divisions, journal] = await Promise.all([
        loadCorporationWallets(characterId, corporationId),
        loadCorporationDivisions(characterId, corporationId, can('canReadDivisions')),
        withJournal
          ? loadCorporationWalletJournal(characterId, corporationId, MASTER_WALLET_DIVISION)
          : null,
      ]);
      // Balances are the data: without them a "0 ISK" would read as a broke corporation.
      if (wallets.cached === null) return unlanded('wallet', wallets);
      const lines: CorpJournalLine[] | null =
        journal === null || journal.cached === null
          ? null
          : journal.cached.data.flatMap((entry) => {
              const atMs = parseInstant(entry.date);
              // A line with no amount moves no ISK.
              if (atMs === null || entry.amount === undefined) return [];
              return [{ atMs, amount: entry.amount, refType: entry.ref_type }];
            });
      return {
        reads: [wallets, divisions, journal],
        body: {
          // Named by the divisions read when it landed; a missing name degrades one label only.
          divisions: walletDivisions(wallets.cached.data, divisions.cached?.data ?? null),
          journalDivision: MASTER_WALLET_DIVISION,
          journal: lines,
        },
      };
    },
  });
}

export function loadCorpJobs(characterId: number): Promise<CorpJobsFeed> {
  return readCorpFeed<CorpJobsFeed>(characterId, {
    capability: 'canReadIndustry',
    empty: { jobs: [], typeNames: new Map(), installerNames: new Map() },
    read: async ({ corporationId }) => {
      const result = await loadCorporationIndustryJobs(characterId, corporationId);
      if (result.cached === null) return unlanded('industry jobs', result);
      const jobs = result.cached.data;
      const [typeNames, installerNames] = await Promise.all([
        loadTypeNames(jobTypeIds(jobs)),
        resolveNames([...new Set(jobs.map((job) => job.installer_id))]),
      ]);
      return { reads: [result], body: { jobs, typeNames, installerNames } };
    },
  });
}

export function loadCorpCustoms(characterId: number): Promise<CorpCustomsFeed> {
  return readCorpFeed<CorpCustomsFeed>(characterId, {
    capability: 'canReadCustomsOffices',
    empty: { offices: [], typeNames: new Map(), systemNames: new Map() },
    read: async ({ corporationId }) => {
      const result = await loadCorporationCustomsOffices(characterId, corporationId);
      if (result.cached === null) return unlanded('customs offices', result);
      const offices = result.cached.data;
      const typeIds = [
        ...new Set(
          offices.flatMap((office) => (office.type_id === undefined ? [] : [office.type_id]))
        ),
      ];
      const [typeNames, systems] = await Promise.all([
        typeIds.length === 0 ? new Map<number, string>() : loadTypeNames(typeIds),
        import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
      ]);
      const systemNames = new Map<number, string>();
      for (const office of offices) {
        const name = systems?.get(office.system_id)?.name;
        if (name !== undefined) systemNames.set(office.system_id, name);
      }
      return { reads: [result], body: { offices, typeNames, systemNames } };
    },
  });
}

/**
 * The page's own corp asset read (`loadCorporationAssets`, same cache row) with
 * the page's own price and copy-value inputs, reduced to the widget's counts.
 */
export function loadCorpAssets(characterId: number): Promise<CorpAssetsFeed> {
  return readCorpFeed<CorpAssetsFeed>(characterId, {
    capability: 'canReadAssets',
    empty: { corporationId: null, summary: null, truncated: false },
    read: async ({ corporationId, can }) => {
      const result = await loadCorporationAssets(characterId, corporationId);
      // No assets read means no counts: a zero would read as "all clear".
      if (result.cached === null) return unlanded('assets', result);
      const assets = result.cached.data;
      const canReadBlueprints = can('canReadBlueprints');
      const [prices, copyValues] = await Promise.all([
        // A failed price read leaves counts without values, as the page does.
        getAveragePriceByType().catch(() => new Map<number, number>()),
        loadAssetCopyValues(characterId, assets, async () =>
          canReadBlueprints
            ? ((await loadCorporationBlueprints(characterId, corporationId)).cached?.data ?? null)
            : null
        ),
      ]);
      const { items } = classifyCorpAssets(toCorpAssetInputs(assets));
      return {
        reads: [result],
        body: {
          corporationId,
          summary: summariseCorpAssets(items, { prices, copyValues }),
          truncated: result.cached.truncated,
        },
      };
    },
  });
}

export function loadCorpRoleAudit(characterId: number): Promise<CorpRoleAuditFeed> {
  return readCorpFeed<CorpRoleAuditFeed>(characterId, {
    capability: 'canReadRoleAudit',
    empty: { audit: null },
    read: async ({ corporationId }) => {
      const result = await loadRoleAudit(characterId, corporationId, { withTitles: false });
      if ('needsReauth' in result) return { needsReauth: true };
      const { data } = result;
      return {
        age: { fetchedAt: data.fetchedAt, fromCache: data.fromCache },
        body: { audit: data },
      };
    },
  });
}

export function loadCorpMembers(characterId: number): Promise<CorpMembersFeed> {
  const loadedAt = Date.now();
  return readCorpFeed<CorpMembersFeed>(characterId, {
    capability: 'canReadMembers',
    empty: {
      members: [],
      diff: null,
      names: new Map(),
      darkAfterDays: useDarkThreshold.getState().value,
      loadedAt,
    },
    read: async ({ corporationId }) => {
      const [tracking, ids, baseline] = await Promise.all([
        loadCorporationMemberTracking(characterId, corporationId),
        loadCorporationMemberIds(characterId, corporationId),
        readPreviousRoster(characterId, corporationId),
        useDarkThreshold.getState().hydrate(),
      ]);
      if (tracking.cached === null) return unlanded('member tracking', tracking);
      const members = toMemberActivity(tracking.cached.data);
      const memberIds = ids.cached?.data ?? null;
      // Read, never recorded: `/corp/members` records it, so each change is announced there exactly once.
      const diff = memberIds === null ? null : diffRoster(baseline, memberIds);
      const darkAfterDays = useDarkThreshold.getState().value;
      const darkBefore = loadedAt - darkAfterDays * DAY_MS;
      const named = new Set<number>([...(diff?.joined ?? []), ...(diff?.left ?? [])]);
      for (const member of members) {
        const last = Math.max(member.logonMs ?? 0, member.logoffMs ?? 0);
        if (last < darkBefore) named.add(member.characterId);
      }
      return {
        reads: [tracking, ids],
        body: {
          members,
          diff,
          names: named.size === 0 ? new Map() : await resolveNames([...named]),
          darkAfterDays,
          loadedAt,
        },
      };
    },
  });
}

export function loadCorpMining(characterId: number): Promise<CorpMiningFeed> {
  const empty = {
    rows: [],
    refineryCount: 0,
    truncated: false,
    typeNames: new Map<number, string>(),
    minerNames: new Map<number, string>(),
  };
  return readCorpFeed<CorpMiningFeed>(characterId, {
    capability: 'canReadMiningLedger',
    empty,
    read: async ({ corporationId }) => {
      const feed = await loadObserverFeed(characterId, corporationId);
      if (feed === 'needs-reauth') return { needsReauth: true };
      if (feed === 'unavailable') throw new CorpReadFailed('mining ledger');
      // No refinery this Character can read is an answer, not an outage: an empty ledger.
      if (feed === 'no-refineries') {
        return { age: { fetchedAt: new Date(), fromCache: false }, body: empty };
      }
      const [typeNames, minerNames] = await Promise.all([
        loadTypeNames([...new Set(feed.rows.map((row) => row.typeId))]),
        resolveNames([...new Set(feed.rows.map((row) => row.characterId))]),
      ]);
      // The oldest response behind the rows; a reduce, since a big ledger is too many arguments for Math.min.
      const oldest = feed.rows.reduce((min, row) => {
        const at = Date.parse(row.cachedAt);
        return Number.isFinite(at) && at < min ? at : min;
      }, Number.POSITIVE_INFINITY);
      return {
        age: {
          fetchedAt: new Date(Number.isFinite(oldest) ? oldest : Date.now()),
          fromCache: false,
        },
        body: {
          rows: feed.rows,
          refineryCount: feed.structureIds.length,
          truncated: feed.truncated,
          typeNames,
          minerNames,
        },
      };
    },
  });
}

export function loadCorpStarbases(characterId: number): Promise<CorpStarbasesFeed> {
  return readCorpFeed<CorpStarbasesFeed>(characterId, {
    capability: 'canReadStarbases',
    empty: { starbases: [], typeNames: new Map(), systemNames: new Map() },
    read: async ({ corporationId }) => {
      const list = await loadCorporationStarbases(characterId, corporationId);
      if (list.cached === null) return unlanded('starbases', list);
      const towers = list.cached.data;
      // Fuel and strontium live on the per-tower call. An online tower burns fuel and a reinforced one
      // holds its strontium bay; an offline, onlining or unanchoring one has nothing worth the read.
      const readable = towers.filter(
        (tower) => tower.state === 'online' || tower.state === 'reinforced'
      );
      const [details, typeNames, systems] = await Promise.all([
        loadStarbaseDetails(characterId, corporationId, readable),
        loadTypeNames([...new Set(towers.map((tower) => tower.type_id))]),
        import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
      ]);
      // Same static-data names as the Customs offices widget.
      const systemNames = new Map<number, string>();
      for (const tower of towers) {
        const name = systems?.get(tower.system_id)?.name;
        if (name !== undefined) systemNames.set(tower.system_id, name);
      }
      const starbases = towers.map((tower): CorpStarbaseRow => {
        const read = details.get(tower.starbase_id)?.cached;
        return {
          starbaseId: tower.starbase_id,
          systemId: tower.system_id,
          typeId: tower.type_id,
          state: tower.state ?? 'unknown',
          reinforcedUntilMs: parseInstant(tower.reinforced_until),
          unanchorsAtMs: parseInstant(tower.unanchor_at),
          bay: read ? summariseBay(read.data.fuels) : null,
          // Each bay's own read time: a detail that fell back to an old cached row must not drag the others.
          bayReadAtMs: read ? read.fetchedAt.getTime() : null,
        };
      });
      return { reads: [list, ...details.values()], body: { starbases, typeNames, systemNames } };
    },
  });
}

export function loadCorpContracts(characterId: number): Promise<CorpContractsFeed> {
  return readCorpFeed<CorpContractsFeed>(characterId, {
    capability: 'canReadContracts',
    empty: { contracts: [], names: new Map() },
    read: async ({ corporationId }) => {
      const result = await loadCorporationContracts(characterId, corporationId);
      if (result.cached === null) return unlanded('contracts', result);
      const contracts = result.cached.data;
      const open = contracts.filter(
        (c) => c.status === 'outstanding' || c.status === 'in_progress'
      );
      const names = await resolveNames([
        ...new Set(open.flatMap((c) => [c.issuer_id, c.assignee_id]).filter((id) => id > 0)),
      ]);
      return { reads: [result], body: { contracts, names } };
    },
  });
}

export function loadCorpOrders(characterId: number): Promise<CorpOrdersFeed> {
  return readCorpFeed<CorpOrdersFeed>(characterId, {
    capability: 'canReadOrders',
    empty: {
      orders: [],
      typeNames: new Map(),
      stationNames: new Map(),
      stationPrices: new Map(),
      issuerNames: new Map(),
    },
    read: async ({ corporationId }) => {
      const result = await loadCorporationOrders(characterId, corporationId);
      if (result.cached === null) return unlanded('market orders', result);
      const orders = result.cached.data;
      const typesByStation = new Map<number, Set<number>>();
      for (const order of orders) {
        const set = typesByStation.get(order.location_id) ?? new Set<number>();
        set.add(order.type_id);
        typesByStation.set(order.location_id, set);
      }
      const [typeNames, issuerNames, stationPrices, stations] = await Promise.all([
        loadTypeNames([...new Set(orders.map((o) => o.type_id))]),
        resolveNames([...new Set(orders.map((o) => o.issued_by ?? 0).filter((id) => id > 0))]),
        loadStationBestPrices(
          [...typesByStation].map(([stationId, ids]) => ({ stationId, typeIds: [...ids] }))
        ),
        // Offline first visit: the station file may be missing. Names then read as a structure.
        loadNpcStations().catch(() => []),
      ]);
      return {
        reads: [result],
        body: {
          orders,
          typeNames,
          stationNames: new Map(stations.map((s) => [s.id, s.name])),
          stationPrices,
          issuerNames,
        },
      };
    },
  });
}

/**
 * SRP is Firestore, not ESI: the roles gate comes first, then the live officer check (which
 * also renews the 24 h record the claim rules read), then the open claims. A failure of either
 * call throws, so the widget shows Retry rather than a false "no claims".
 */
export function loadCorpSrp(characterId: number): Promise<CorpSrpFeed> {
  const empty = {
    enabled: false,
    canSetUp: false,
    claims: [],
    typeNames: new Map<number, string>(),
    systemNames: new Map<number, string>(),
  };
  return readCorpFeed<CorpSrpFeed>(characterId, {
    capability: 'canManageSrp',
    empty,
    read: async ({ corporationId }) => {
      // Local table: load it while the officer check is in flight.
      const systemsLoad = import('@/sde/solarSystems')
        .then((m) => m.loadSolarSystemsById())
        .catch(() => null);
      const verdict = await verifySrpOfficer(characterId, corporationId);
      if (!verdict.canManage) return { unreadable: true };
      const age = { fetchedAt: new Date(), fromCache: false };
      const base = { ...empty, canSetUp: verdict.isDirector };
      if (!verdict.srpEnabled) return { age, body: base };
      const claims = await readSrpClaims(characterId, corporationId);
      const hullIds = [...new Set(claims.map((c) => c.hullTypeId))];
      const [typeNames, systems] = await Promise.all([
        hullIds.length === 0
          ? new Map<number, string>()
          : loadTypeNames(hullIds).catch(() => new Map<number, string>()),
        systemsLoad,
      ]);
      const systemNames = new Map<number, string>();
      for (const c of claims) {
        const name = systems?.get(c.solarSystemId)?.name;
        if (name !== undefined) systemNames.set(c.solarSystemId, name);
      }
      return { age, body: { ...base, enabled: true, claims, typeNames, systemNames } };
    },
  });
}

/**
 * Not a corp-ESI read (no role, no scope): the corporation id is public, and
 * the totals are the ones the Public info Corporation tab shows, through the
 * same cached `fetchCorporationStats`, so widget and modal never disagree.
 */
export async function loadCorpKills(characterId: number): Promise<CorpKillsFeed> {
  const none: CorpKillsFeed = { ...UNREADABLE, corporationId: null, stats: null, failed: null };
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return none;
  // The modal skips the killboard for an NPC corporation, so there is nothing to show.
  if (isNpcCorporationId(corporationId)) return { ...none, corporationId };
  const { result, fetchedAt, fromCache } = await fetchCorporationStatsRead(corporationId);
  const base = { readable: true, needsReauth: false, fetchedAt, fromCache };
  if (result.kind === 'failed') {
    return { ...base, corporationId, stats: null, failed: result.reason };
  }
  return {
    ...base,
    corporationId,
    stats: result.kind === 'stats' ? result.stats : null,
    failed: null,
  };
}

export function loadCorpSovereignty(characterId: number): Promise<CorpSovereigntyFeed> {
  return readCorpFeed<CorpSovereigntyFeed>(characterId, {
    capability: 'canReadSkyhooks',
    empty: {
      rows: [],
      systemNames: new Map(),
      typeNames: new Map(),
      prices: new Map(),
      jumps: new Map(),
    },
    read: async ({ corporationId }) => {
      const [skyhooks, hubs] = await Promise.all([
        loadCorporationSkyhooks(characterId, corporationId),
        loadCorporationSovereigntyHubs(characterId, corporationId),
      ]);
      if (skyhooks.cached === null && hubs.cached === null)
        return unlanded('sovereignty', skyhooks, hubs);
      const skyhookList = skyhooks.cached?.data.skyhooks ?? [];
      const hubList = hubs.cached?.data.sovereignty_hubs ?? [];
      const [skyhookDetails, hubDetails, planets] = await Promise.all([
        loadSkyhookDetails(
          characterId,
          corporationId,
          skyhookList.map((s) => s.id)
        ),
        loadHubDetails(
          characterId,
          corporationId,
          hubList.map((h) => h.id)
        ),
        planetInfo([...new Set(skyhookList.map((s) => s.planet_id))]),
      ]);

      // Every detail read failing says the reads are down, not that nothing is raidable.
      const details = [...skyhookDetails.values(), ...hubDetails.values()];
      if (details.length > 0 && details.every((result) => result.cached === null)) {
        return unlanded('sovereignty', ...details);
      }

      const rows: CorpSovereigntyRow[] = [
        ...skyhookList.map((skyhook): CorpSovereigntyRow => {
          const detail = skyhookDetails.get(skyhook.id)?.cached?.data;
          const window = detail?.theft_vulnerability;
          const planet = planets.get(skyhook.planet_id);
          const reagents = detail?.reagents?.map((r) => ({
            typeId: r.type_id,
            secured: r.secured_stock,
            unsecured: r.unsecured_stock,
          }));
          return {
            key: `skyhook:${skyhook.id}`,
            kind: 'skyhook',
            structureId: skyhook.id,
            systemId: planet?.systemId ?? null,
            planetName: planet?.name ?? null,
            windowStartMs: parseInstant(window?.start),
            windowEndMs: parseInstant(window?.end),
            // A non-number is unknown, never "0 at risk".
            reagents:
              reagents === undefined ||
              reagents.some((r) => !Number.isFinite(r.secured) || !Number.isFinite(r.unsecured))
                ? null
                : reagents,
            state: detail?.state ?? null,
            hubBay: null,
          };
        }),
        ...hubList.map((hub): CorpSovereigntyRow => {
          const detail = hubDetails.get(hub.id)?.cached?.data;
          const window = detail?.vulnerability_window;
          const reagents = detail?.reagent_bay.reagents ?? [];
          const updatedMs = parseInstant(detail?.reagent_bay.last_updated);
          const amount = reagents.reduce((sum, r) => sum + r.amount, 0);
          const burningPerHour = reagents.reduce((sum, r) => sum + r.burning_per_hour, 0);
          return {
            key: `hub:${hub.id}`,
            kind: 'hub',
            structureId: hub.id,
            systemId: hub.solar_system_id,
            planetName: null,
            windowStartMs: parseInstant(window?.start),
            windowEndMs: parseInstant(window?.end),
            reagents: null,
            state: null,
            // An unreadable timestamp or a non-number is unknown, never "0 hours left".
            hubBay:
              detail === undefined ||
              reagents.length === 0 ||
              updatedMs === null ||
              !Number.isFinite(amount + burningPerHour)
                ? null
                : { amount, burningPerHour, updatedMs },
          };
        }),
      ];

      const systemIds = [
        ...new Set(rows.flatMap((row) => (row.systemId === null ? [] : [row.systemId]))),
      ];
      const reagentTypeIds = [
        ...new Set(rows.flatMap((row) => row.reagents ?? []).map((r) => r.typeId)),
      ];
      const [systems, jumps, typeNames, prices] = await Promise.all([
        import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
        jumpsFromCurrent(characterId, systemIds),
        reagentTypeIds.length === 0
          ? new Map<number, string>()
          : loadTypeNames(reagentTypeIds).catch(() => new Map<number, string>()),
        reagentTypeIds.length === 0
          ? new Map<number, number>()
          : getAveragePriceByType().catch(() => new Map<number, number>()),
      ]);
      const systemNames = new Map<number, string>();
      for (const systemId of systemIds) {
        const name = systems?.get(systemId)?.name;
        if (name !== undefined) systemNames.set(systemId, name);
      }
      return {
        reads: [skyhooks, hubs, ...skyhookDetails.values(), ...hubDetails.values()],
        body: { rows, systemNames, typeNames, prices, jumps },
      };
    },
  });
}

// --- Due soon across every corporation (All scope) ----------------------------------

/** Each Due soon source, the capability that opens it, and its one-corporation read. */
const DEADLINE_READS: readonly {
  source: CorpDeadlineSource;
  capability: CorpCapability;
  load: (characterId: number) => Promise<NonNullable<CorpDeadlinesSlice[CorpDeadlineSource]>>;
}[] = [
  { source: 'structures', capability: 'canReadStructures', load: loadStructuresBoardData },
  { source: 'moonChunks', capability: 'canReadMoonExtractions', load: loadMoonChunksBoardData },
  { source: 'jobs', capability: 'canReadIndustry', load: loadCorpJobs },
  { source: 'starbases', capability: 'canReadStarbases', load: loadCorpStarbases },
  { source: 'sovereignty', capability: 'canReadSkyhooks', load: loadCorpSovereignty },
];

/** A corporation's Due soon slice before any read lands. */
const emptySlice = (corporationId: number): CorpDeadlinesSlice => ({
  corporationId,
  structures: null,
  moonChunks: null,
  jobs: null,
  starbases: null,
  sovereignty: null,
  failed: false,
});

/**
 * Every corporation's Due soon sources, each read through a Character whose roles and grant
 * cover that source there (`corpReadersFor`), so no read is made that can only 403. A read
 * that fails leaves its corporation without that source, flagged; only when every read
 * fails does the widget get its Retry. `only` narrows the read to those sources.
 */
export async function loadCorpDeadlinesAll(
  only?: readonly CorpDeadlineSource[]
): Promise<CorpDeadlinesAllFeed> {
  const accounts = await loadAccountCorpAccess();
  // The active Character reads its own corporation, sharing the cache rows `/corp` warmed.
  const preferred = useActiveCharacter.getState().activeCharacterId ?? undefined;
  const slices = new Map<number, CorpDeadlinesSlice>();
  const tasks = DEADLINE_READS.filter(
    ({ source }) => only === undefined || only.includes(source)
  ).flatMap(({ source, capability, load }) =>
    [...corpReadersFor(accounts, capability, preferred)].map(([corporationId, characterId]) => {
      if (!slices.has(corporationId)) slices.set(corporationId, emptySlice(corporationId));
      return { slice: slices.get(corporationId)!, source, load, characterId };
    })
  );
  const feederChunks =
    only === undefined || only.includes('moonChunks')
      ? startFeederChunks(accounts, preferred)
      : Promise.resolve<FeederChunks>(() => new Map());
  let failures = 0;
  await mapWithConcurrencyLimit(tasks, ESI_FANOUT_CONCURRENCY, async (task) => {
    try {
      // Each source's slot takes its own read's shape.
      (task.slice as Record<CorpDeadlineSource, unknown>)[task.source] = await task.load(
        task.characterId
      );
    } catch {
      task.slice.failed = true;
      failures += 1;
    }
  });
  // Feeder pops from the Corp Tax Books these Characters view (#6116), for every corporation
  // no Character read from ESI. Started beside the ESI reads.
  let fromBooks = 0;
  const feeders = await feederChunks;
  const esi = new Set(
    [...slices.values()]
      .filter((slice) => slice.moonChunks?.chunks != null)
      .map((slice) => slice.corporationId)
  );
  for (const [corporationId, moonChunks] of feeders(esi)) {
    const slice = slices.get(corporationId) ?? emptySlice(corporationId);
    slices.set(corporationId, { ...slice, moonChunks });
    fromBooks += 1;
  }
  if (tasks.length > 0 && failures === tasks.length && fromBooks === 0) {
    throw new CorpReadFailed('deadlines');
  }
  const corporations = [...slices.values()];
  return {
    corporations,
    labels: await loadCorpLabels(corporations.map((slice) => slice.corporationId)),
  };
}

// --- One widget across every corporation (All scope) --------------------------------

/**
 * `load` once per corporation some Character can read `capability` for (`corpReadersFor`;
 * null for an ungated read), the active Character reading its own corporation so it shares
 * the cache rows `/corp` warmed. A failed corporation is left out, flagged; only when every
 * one fails does the widget get its Retry.
 */
async function loadEveryCorp<F extends CorpFeedBase>(
  capability: CorpCapability | null,
  what: string,
  load: (characterId: number) => Promise<F>
): Promise<CorpAllFeed<F>> {
  const accounts = await loadAccountCorpAccess();
  const { reads, partlyFailed } = await settleCorps(
    corpReadersFor(accounts, capability, activeReader()),
    what,
    load
  );
  return {
    corporations: reads.map((read) => ({ corporationId: read.corporationId, feed: read })),
    labels: await loadCorpLabels(reads.map((read) => read.corporationId)),
    partlyFailed,
  };
}

/** Balances only: Cash flow, Income and runway stay on one corporation. */
export const loadCorpWalletAll = () =>
  loadEveryCorp('canReadWallet', 'wallet', (characterId) => loadCorpWallet(characterId, false));

export const loadCorpJobsAll = () =>
  loadEveryCorp('canReadIndustry', 'industry jobs', loadCorpJobs);

/** Public zKillboard totals: every corporation a Character belongs to, no role asked. */
export const loadCorpKillsAll = () => loadEveryCorp(null, 'kills', loadCorpKills);

/** One corporation's read, tagged with its corporation. */
type CorpTagged<F> = F & { corporationId: number };

interface CorpAllSpec<F extends CorpFeedBase> {
  capability: CorpCapability;
  what: string;
  /** The widget's one-corporation read. */
  load: (characterId: number) => Promise<F>;
  /** The readable reads' bodies as one; with no read, the empty body. */
  merge: (reads: readonly CorpTagged<F>[]) => {
    body: CorpFeedBody<F>;
    corporationOf: ReadonlyMap<string, number>;
  };
  /** Corporations read at once (default the ESI fan-out limit). */
  concurrency?: number;
}

/**
 * A widget's read over every corporation some Character can read it for (`corpReadersFor`,
 * the active Character preferred), so no read is made that can only 403. A corporation that
 * fails is left out and the feed flagged; only when every one fails does the widget get its
 * Retry. Data Age is the stalest corporation.
 */
async function readAllCorps<F extends CorpFeedBase>(spec: CorpAllSpec<F>): Promise<F> {
  const readers = await accountCorpReaders(spec.capability, activeReader());
  const { reads, partlyFailed } = await settleCorps(
    readers,
    spec.what,
    spec.load,
    spec.concurrency
  );
  const readable = reads.filter((read) => read.readable);
  const { body, corporationOf } = spec.merge(readable);
  if (readable.length === 0) {
    return { ...UNREADABLE, needsReauth: reads.some((read) => read.needsReauth), ...body } as F;
  }
  const merged: CorpFeedBase = {
    readable: true,
    needsReauth: readable.some((read) => read.needsReauth),
    fetchedAt: oldest(readable.map((read) => read.fetchedAt)),
    fromCache: readable.some((read) => read.fromCache),
    ...body,
    corporations: await loadCorpLabels(readable.map((read) => read.corporationId)),
    corporationOf,
    partlyFailed,
  };
  return merged as F;
}

/** Each read's rows under its corporation, for `mergeCorpRows`. */
const rowsOf = <F, T>(reads: readonly CorpTagged<F>[], pick: (read: F) => readonly T[]) =>
  reads.map((read) => ({ corporationId: read.corporationId, rows: pick(read) }));

export function loadCorpCustomsAll(): Promise<CorpCustomsFeed> {
  return readAllCorps<CorpCustomsFeed>({
    capability: 'canReadCustomsOffices',
    what: 'customs offices',
    load: loadCorpCustoms,
    merge: (reads) => {
      const { rows, corporationOf } = mergeCorpRows(
        rowsOf(reads, (read) => read.offices),
        (office) => String(office.office_id)
      );
      return {
        corporationOf,
        body: {
          offices: rows,
          typeNames: mergeLookups(reads.map((read) => read.typeNames)),
          systemNames: mergeLookups(reads.map((read) => read.systemNames)),
        },
      };
    },
  });
}

export function loadCorpStarbasesAll(): Promise<CorpStarbasesFeed> {
  return readAllCorps<CorpStarbasesFeed>({
    capability: 'canReadStarbases',
    what: 'starbases',
    load: loadCorpStarbases,
    merge: (reads) => {
      const { rows, corporationOf } = mergeCorpRows(
        rowsOf(reads, (read) => read.starbases),
        (row) => String(row.starbaseId)
      );
      return {
        corporationOf,
        body: {
          starbases: rows,
          typeNames: mergeLookups(reads.map((read) => read.typeNames)),
          systemNames: mergeLookups(reads.map((read) => read.systemNames)),
        },
      };
    },
    // One corporation at a time: each reads its towers' details under the fan-out limit,
    // so the limit holds across corporations too.
    concurrency: 1,
  });
}

export function loadCorpSovereigntyAll(): Promise<CorpSovereigntyFeed> {
  return readAllCorps<CorpSovereigntyFeed>({
    capability: 'canReadSkyhooks',
    what: 'sovereignty',
    load: loadCorpSovereignty,
    merge: (reads) => {
      const { rows, corporationOf } = mergeCorpRows(
        rowsOf(reads, (read) => read.rows),
        (row) => row.key
      );
      return {
        corporationOf,
        body: {
          rows,
          systemNames: mergeLookups(reads.map((read) => read.systemNames)),
          typeNames: mergeLookups(reads.map((read) => read.typeNames)),
          prices: mergeLookups(reads.map((read) => read.prices)),
          jumps: mergeLookups(reads.map((read) => read.jumps)),
        },
      };
    },
  });
}

export function loadCorpContractsAll(): Promise<CorpContractsFeed> {
  return readAllCorps<CorpContractsFeed>({
    capability: 'canReadContracts',
    what: 'contracts',
    load: loadCorpContracts,
    merge: (reads) => {
      // A contract between two of the pilot's corporations is in both reads: kept once,
      // under the corporation that issued it.
      const { rows, corporationOf } = mergeCorpRows(
        rowsOf(reads, (read) => read.contracts),
        (contract) => String(contract.contract_id)
      );
      const read = new Set(reads.map((r) => r.corporationId));
      for (const contract of rows) {
        if (read.has(contract.issuer_corporation_id)) {
          corporationOf.set(String(contract.contract_id), contract.issuer_corporation_id);
        }
      }
      return {
        corporationOf,
        body: { contracts: rows, names: mergeLookups(reads.map((read) => read.names)) },
      };
    },
  });
}

export function loadCorpOrdersAll(): Promise<CorpOrdersFeed> {
  return readAllCorps<CorpOrdersFeed>({
    capability: 'canReadOrders',
    what: 'market orders',
    load: loadCorpOrders,
    merge: (reads) => {
      const { rows, corporationOf } = mergeCorpRows(
        rowsOf(reads, (read) => read.orders),
        (order) => String(order.order_id)
      );
      return {
        corporationOf,
        body: {
          orders: rows,
          typeNames: mergeLookups(reads.map((read) => read.typeNames)),
          stationNames: mergeLookups(reads.map((read) => read.stationNames)),
          stationPrices: mergeLookups(reads.map((read) => read.stationPrices)),
          issuerNames: mergeLookups(reads.map((read) => read.issuerNames)),
        },
      };
    },
  });
}
