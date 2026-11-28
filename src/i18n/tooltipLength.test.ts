import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

const MAX_WORDS = 30;

function longTooltips(node: unknown, path: string[] = []): string[] {
  if (typeof node === 'string') {
    const last = path[path.length - 1] ?? '';
    const words = node.trim().split(/\s+/).length;
    return /(tooltip|tip|help)$/i.test(last) && words > MAX_WORDS ? [path.join('.')] : [];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => longTooltips(v, [...path, k]));
  }
  return [];
}

const ALLOWED_LONG = new Set<string>([
  'industry.materialPriceBasisTooltip',
  'industry.salePriceTooltip',
  'industry.buildSystemTooltip',
  'industry.includeReactionsTooltip',
  'industry.iskPerDayTooltip',
  'industry.vs90dTooltip',
  'industry.marketOpportunitiesLiquidityTooltip',
  'industry.iskPerHourTooltip',
  'industry.breakEvenPriceTooltip',
  'industry.costIndexTooltip',
  'industry.costIndexOverrideTooltip',
  'wallet.marginTooltip',
  'pi.stalenessTooltip',
  'pi.yield.decayedTooltip',
  'piPlan.baselineTooltip',
  'piPlan.fitAsBuiltTooltip',
  'loyaltyStore.landing.colLpValueHelp',
  'market.hauling.columns.expectedTip',
  'market.hauling.columns.profitInstantTip',
  'market.hauling.columns.daysTip',
  'market.hauling.columns.buyOrderTip',
  'market.hauling.columns.marginInstantTip',
  'market.appraisal.columnTurnInHelp',
  'market.appraisal.turnIn.chipHelp',
  'market.appraisal.refineTotalHelp',
  'market.appraisal.refineYieldHelp',
  'market.appraisal.breakdown.efficiencyHelp',
  'market.priceHistory.noOrderDataTip',
  'market.orders.floorHelp',
  'contractSearch.hideUncompletableTooltip',
  'contractSearch.belowMarket.otherTooltip',
  'travel.pilot.killerMeterHelp',
  'travel.pilot.threat.help',
]);

describe('tooltip length', () => {
  const offenders = longTooltips(en);

  it(`new tooltips stay within ${MAX_WORDS} words`, () => {
    expect(offenders.filter((k) => !ALLOWED_LONG.has(k))).toEqual([]);
  });

  it('allowlist lists only tooltips still over the limit', () => {
    expect([...ALLOWED_LONG].filter((k) => !offenders.includes(k))).toEqual([]);
  });
});
