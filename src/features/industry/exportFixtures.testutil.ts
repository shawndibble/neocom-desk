/** Typed fixtures for the industry export tests: full records with every field set, overridable per test. */
import type { BuildResult } from '@/engine/industry/types';
import { TRADE_HUBS } from '@/market/hubs';
import type { MarketWideDayRow } from './marketWideOpportunities';
import type { OpportunityRow } from './opportunities';
import type { ComparedBuildRow } from './useComparedBuildResults';

export function buildResult(overrides: Partial<BuildResult> = {}): BuildResult {
  return {
    materials: [],
    seconds: 3600,
    jobFee: { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 0 },
    materialCost: 0,
    totalCost: 0,
    buyCost: null,
    revenue: null,
    salesTax: null,
    brokerFee: null,
    netRevenue: null,
    profit: null,
    marginPct: null,
    iskPerHour: null,
    grossProfit: null,
    grossMargin: null,
    grossIskPerHour: null,
    breakEvenPrice: null,
    unpricedMaterials: [],
    unpriceable: false,
    recommendation: 'unknown',
    ...overrides,
  };
}

export function comparedRow(overrides: Partial<ComparedBuildRow> = {}): ComparedBuildRow {
  return {
    planId: 'p1',
    planName: 'Rifter run',
    productName: 'Rifter',
    runs: 10,
    loading: false,
    result: null,
    groupResult: null,
    error: null,
    ...overrides,
  };
}

export function opportunityRow(
  overrides: Partial<Omit<OpportunityRow, 'result'>> & { result?: Partial<BuildResult> } = {}
): OpportunityRow {
  const { result, ...rest } = overrides;
  return {
    candidate: {
      id: '1:1',
      characterId: 1,
      characterName: 'Pilot One',
      blueprint: {
        item_id: 1,
        type_id: 100,
        runs: -1,
        material_efficiency: 10,
        time_efficiency: 20,
        quantity: 1,
        location_id: 60003760,
        location_flag: 'Hangar',
      },
      catalogEntry: {
        blueprintTypeID: 100,
        blueprint: {
          name: 'Rifter Blueprint',
          time: 3600,
          materials: [],
          products: [{ typeID: 587, quantity: 1 }],
          skills: [],
          activity: 'manufacturing',
        },
        productTypeID: 587,
        productName: 'Rifter',
        productNameLower: 'rifter',
      },
    },
    result: buildResult(result),
    sellDepthIsk: null,
    hub: TRADE_HUBS[0],
    materialSourcing: {},
    buildHere: [],
    defaultsFrom: null,
    forgoneSale: 0,
    orderDepth: 'thin',
    ...rest,
  };
}

export function marketWideDayRow(overrides: Partial<MarketWideDayRow> = {}): MarketWideDayRow {
  return {
    id: '587',
    iskPerHour: null,
    buildCost: 1_500_000,
    sellDepthIsk: null,
    orderDepth: 'deep',
    productTypeID: 587,
    marginPct: 62.5,
    seconds: 3600,
    unitMargin: 0,
    outputQuantity: 1,
    me: 0,
    te: 0,
    productName: 'Rifter',
    blueprintTypeID: 100,
    blueprintSource: 'market',
    priceCapped: false,
    iskPerDay: 48_000,
    vs90d: 35.4,
    ...overrides,
  };
}
