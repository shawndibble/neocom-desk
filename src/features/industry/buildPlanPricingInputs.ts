import { useMemo } from 'react';
import { loadBpcOfferRows } from '@/features/bpcContracts/bpcOfferRows';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  effectivePrice,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import { useCommunityBlueprintOffers } from '@/features/bpcContracts/useCommunityBlueprintOffers';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import type { TradeHub } from '@/market/hubs';
import {
  tradeHubStanding,
  useTradeHubStandings,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import { useWarmLoad } from '@/lib/useWarmLoad';
import { useAssumedMe } from './assumedMe';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import { useProfitBasis } from './profitBasisSetting';
import { useCorpOwnedBlueprints, type CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import type { BuildPlanSources, CorpBlueprintSource } from './resolveBuildPlan';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface BuildPlanPricingInputs {
  hydrated: boolean;
  assumedMe: number;
  profitBasis: ProfitBasis;
  corpBlueprints: CorpOwnedBlueprintsState;
  standings: TradeHubStandingsMap;
  bpcRows: readonly BpcContractRow[];
  communityRows: readonly BpcSearchRow[];
}

export type HubPricingSources = Pick<
  BuildPlanSources,
  | 'assumedMe'
  | 'corpBlueprints'
  | 'standing'
  | 'bpcOffersFor'
  | 'bpcLastResortOffersFor'
  | 'communityOffersFor'
>;

export type HubPricingSourceArgs = Pick<
  BuildPlanPricingInputs,
  'assumedMe' | 'profitBasis' | 'standings' | 'bpcRows' | 'communityRows'
> & { corpBlueprints?: CorpBlueprintSource };

const NO_BPC_ROWS: readonly BpcContractRow[] = [];

export function offersForRegion(
  bpcRows: readonly BpcContractRow[],
  regionId: number,
  outside = false
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const byType = new Map<number, BpcOffer[]>();
  for (const row of bpcRows) {
    if ((row.regionId === regionId) === outside) continue;
    if (row.isAuction || row.requestedPlex) continue;
    const list = byType.get(row.typeId) ?? [];
    list.push({
      me: row.me,
      te: row.te,
      runs: row.runs,
      quantity: row.quantity,
      price: effectivePrice(row),
      isMultiType: row.isMultiType,
    });
    byType.set(row.typeId, list);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? [];
}

export async function loadBpcContractRows(): Promise<readonly BpcContractRow[] | null> {
  return loadBpcOfferRows();
}

async function loadBpcContractRowsOrKeep(): Promise<readonly BpcContractRow[]> {
  const rows = await loadBpcContractRows();
  if (!rows) throw new Error('no BPC contract snapshot');
  return rows;
}

function useBpcContractRows(characterId: number | null): readonly BpcContractRow[] {
  return useWarmLoad('bpcContractRows', characterId, loadBpcContractRowsOrKeep, NO_BPC_ROWS);
}

export function useBuildPlanPricingInputs(characterId: number | null): BuildPlanPricingInputs {
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedMeHydrated = useHydratedStore(useAssumedMe);
  const profitBasis = useProfitBasis((state) => state.value);
  const profitBasisHydrated = useHydratedStore(useProfitBasis);

  const corpBlueprints = useCorpOwnedBlueprints();
  const standings = useTradeHubStandings(characterId);
  const bpcRows = useBpcContractRows(characterId);
  const { rows: communityRows } = useCommunityBlueprintOffers({
    characterId,
    enabled: isSyncConfigured(),
  });
  const hydrated = assumedMeHydrated && profitBasisHydrated;

  return useMemo(
    () => ({
      hydrated,
      assumedMe,
      profitBasis,
      corpBlueprints,
      standings,
      bpcRows,
      communityRows,
    }),
    [hydrated, assumedMe, profitBasis, corpBlueprints, standings, bpcRows, communityRows]
  );
}

export function isPricingReady(inputs: Pick<BuildPlanPricingInputs, 'hydrated'>): boolean {
  return inputs.hydrated;
}

const offersCache = new WeakMap<
  readonly BpcContractRow[],
  Map<string, HubPricingSources['bpcOffersFor']>
>();

function offersFor(
  bpcRows: readonly BpcContractRow[],
  regionId: number,
  outside = false
): (blueprintTypeID: number) => readonly BpcOffer[] {
  let byRegion = offersCache.get(bpcRows);
  if (!byRegion) {
    byRegion = new Map();
    offersCache.set(bpcRows, byRegion);
  }
  const key = `${outside ? '!' : ''}${regionId}`;
  let lookup = byRegion.get(key);
  if (!lookup) {
    lookup = offersForRegion(bpcRows, regionId, outside);
    byRegion.set(key, lookup);
  }
  return lookup;
}

const communityOffersCache = new WeakMap<
  readonly BpcSearchRow[],
  NonNullable<HubPricingSources['communityOffersFor']>
>();

export function communityOffersForRows(
  rows: readonly BpcSearchRow[]
): NonNullable<HubPricingSources['communityOffersFor']> {
  const cached = communityOffersCache.get(rows);
  if (cached) return cached;
  const byType = new Map<number, BpcOffer[]>();
  for (const row of rows) {
    if (row.source !== 'community') continue;
    const list = byType.get(row.typeId) ?? [];
    list.push({
      me: row.me,
      te: row.te,
      runs: row.runs,
      quantity: row.quantity,
      price: 0,
      community: { memberName: row.memberName, stale: row.stale },
    });
    byType.set(row.typeId, list);
  }
  const lookup = (blueprintTypeID: number) => byType.get(blueprintTypeID) ?? [];
  communityOffersCache.set(rows, lookup);
  return lookup;
}

export function pricingSourcesForHub(
  inputs: HubPricingSourceArgs,
  hub: TradeHub
): HubPricingSources {
  return {
    assumedMe: inputs.assumedMe,
    corpBlueprints: inputs.corpBlueprints,
    standing: tradeHubStanding(inputs.standings, hub.id),
    bpcOffersFor: offersFor(inputs.bpcRows, hub.regionId),
    bpcLastResortOffersFor: offersFor(inputs.bpcRows, hub.regionId, true),
    communityOffersFor: communityOffersForRows(inputs.communityRows),
  };
}
