import {
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
} from '@/engine/industry/reprocessing';
import { refiningEfficiency, type CharacterModifiers } from '@/engine/industry/characterModifiers';
import {
  DEFAULT_REFINING_SETUP,
  netOfReprocessingTax,
  type RefiningSetup,
} from '@/engine/industry/refiningSetup';
import { brokerFee, brokerFeePct, salesTax, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalLpOption } from '@/engine/market/lpAcquisition';
import { undercutPrice } from '@/engine/market/priceTick';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface AppraisalRefine {
  valueAtFullPrice: number;
  pricedAll: boolean;
  unitsLeftOver: number;
  sellValueAtFullPrice?: number;
  sellPricedAll?: boolean;
  detail?: AppraisalRefineDetail;
}

export interface AppraisalRefineDetail {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  efficiency: number;
  materialPrices: Readonly<Record<number, number>>;
  materialSellPrices?: Readonly<Record<number, number>>;
}

export const REFINE_BASES = ['buy', 'split', 'sell'] as const;

export type RefineBasis = (typeof REFINE_BASES)[number];

export function priceOnBasis(
  basis: RefineBasis,
  buy: number | null | undefined,
  sell: number | null | undefined
): number | null {
  const buySide = buy ?? null;
  const sellSide = sell ?? null;
  if (basis === 'buy') return buySide;
  if (basis === 'sell') return sellSide;
  return buySide === null || sellSide === null ? null : (buySide + sellSide) / 2;
}

export interface AppraisalItem {
  typeId: number;
  name: string;
  quantity: number;
  buy: number | null;
  sell: number | null;
  refine?: AppraisalRefine;
  lpOption?: AppraisalLpOption;
  unitVolume?: number | null;
  sellIsOwn?: boolean;
  priceState?: PriceState;
  buyWalk?: AppraisalBuyWalk;
}

export interface AppraisalBuyWalk {
  topBid: number;
  topBidTakes: number;
  filled: number;
  unsold: number;
  movedPrice: boolean;
}

export type PriceState = 'live' | 'cached' | 'failed';

export interface AppraisalRow {
  typeId: number;
  name: string;
  quantity: number;
  buyEach: number | null;
  sellEach: number | null;
  buyTotal: number | null;
  sellTotal: number | null;
  refineTotal?: number;
  refinePricedAll?: boolean;
  refineUnitsLeftOver?: number;
  refineSellTotal?: number;
  refineSellPricedAll?: boolean;
  lpCorporationId?: number;
  lpOfferId?: number;
  lpCorpName?: string;
  lpCost?: number;
  lpIskCost?: number;
  lpAffordable?: boolean;
  volume: number | null;
  priceState?: PriceState;
  buyWalk?: AppraisalBuyWalk;
}

export function iskPerM3(row: Pick<AppraisalRow, 'sellTotal' | 'volume'>): number | null {
  if (row.sellTotal === null || row.volume === null || !(row.volume > 0)) return null;
  return row.sellTotal / row.volume;
}

export interface AppraisalTotals {
  buy: number;
  sell: number;
  spread: number;
  unpricedRows: number;
  refine: number;
  refineSell: number;
  refineUnpricedRows: number;
  cheapestBuy: number;
  cheapestBuyViaLp: number;
  volume: number;
  volumeUnknownRows: number;
}

export interface Appraisal {
  rows: AppraisalRow[];
  totals: AppraisalTotals;
  items: readonly AppraisalItem[];
}

function scale(price: number | null, percent: number): number | null {
  return price === null ? null : (price * percent) / 100;
}

export function lpBeatsMarket(row: AppraisalRow): boolean {
  if (row.lpIskCost === undefined || row.lpAffordable !== true) return false;
  return row.sellTotal === null || row.lpIskCost < row.sellTotal;
}

export function buildAppraisal(items: readonly AppraisalItem[], pricePercent: number): Appraisal {
  const rows: AppraisalRow[] = [];
  let buy = 0;
  let sell = 0;
  let unpricedRows = 0;
  let refine = 0;
  let refineSell = 0;
  let refineUnpricedRows = 0;
  let cheapestBuy = 0;
  let cheapestBuyViaLp = 0;
  let volume = 0;
  let volumeUnknownRows = 0;

  for (const item of items) {
    const buyEach = scale(item.buy, pricePercent);
    const sellEach = scale(item.sell, pricePercent);
    const buyTotal = buyEach === null ? null : buyEach * (item.buyWalk?.filled ?? item.quantity);
    const sellTotal = sellEach === null ? null : sellEach * item.quantity;

    if (buyTotal !== null) buy += buyTotal;
    if (sellTotal !== null) sell += sellTotal;
    if (buyTotal === null || sellTotal === null) unpricedRows += 1;

    let refineTotal: number | undefined;
    let refinePricedAll: boolean | undefined;
    let refineUnitsLeftOver: number | undefined;
    let refineSellTotal: number | undefined;
    let refineSellPricedAll: boolean | undefined;
    if (item.refine) {
      refineTotal = (item.refine.valueAtFullPrice * pricePercent) / 100;
      refinePricedAll = item.refine.pricedAll;
      refineUnitsLeftOver = item.refine.unitsLeftOver;
      refine += refineTotal;
      if (item.refine.sellValueAtFullPrice !== undefined) {
        refineSellTotal = (item.refine.sellValueAtFullPrice * pricePercent) / 100;
        refineSellPricedAll = item.refine.sellPricedAll;
        refineSell += refineSellTotal;
      }
      if (!refinePricedAll) refineUnpricedRows += 1;
    }

    const rowVolume =
      item.unitVolume === undefined || item.unitVolume === null
        ? null
        : item.unitVolume * item.quantity;
    if (rowVolume === null) volumeUnknownRows += 1;
    else volume += rowVolume;

    const row: AppraisalRow = {
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      buyEach,
      sellEach,
      buyWalk: item.buyWalk,
      buyTotal,
      sellTotal,
      refineTotal,
      refinePricedAll,
      refineUnitsLeftOver,
      refineSellTotal,
      refineSellPricedAll,
      lpCorporationId: item.lpOption?.corporationId,
      lpOfferId: item.lpOption?.offerId,
      lpCorpName: item.lpOption?.corpName,
      lpCost: item.lpOption?.lpCost,
      lpIskCost: item.lpOption?.iskCost,
      lpAffordable: item.lpOption?.affordableLp,
      volume: rowVolume,
      priceState: item.priceState,
    };

    const useLp = lpBeatsMarket(row);
    const rowCheapest = useLp ? (row.lpIskCost ?? null) : sellTotal;
    if (rowCheapest !== null) cheapestBuy += rowCheapest;
    if (useLp) cheapestBuyViaLp += 1;

    rows.push(row);
  }

  return {
    rows,
    totals: {
      buy,
      sell,
      spread: sell - buy,
      unpricedRows,
      refine,
      refineSell,
      refineUnpricedRows,
      cheapestBuy,
      cheapestBuyViaLp,
      volume,
      volumeUnknownRows,
    },
    items,
  };
}

export interface AppraisalNetFees {
  accountingLevel: number;
  brokerRelationsLevel: number;
  standing: ResolvedStandings;
}

export interface AppraisalNetTotals {
  instantNet: number;
  listNet: number;
  salesTaxPct: number;
  brokerFeePct: number;
}

export interface AppraisalUndercut {
  price: number;
  atOrBelowBuy: boolean;
  matchesOwn: boolean;
}

export function appraisalUndercut(
  item: Pick<AppraisalItem, 'buy' | 'sell' | 'sellIsOwn'>
): AppraisalUndercut | null {
  const matchesOwn = item.sellIsOwn === true;
  const price = item.sell === null ? null : matchesOwn ? item.sell : undercutPrice(item.sell);
  if (price === null) return null;
  return { price, atOrBelowBuy: item.buy !== null && price <= item.buy, matchesOwn };
}

export function appraisalNet(
  items: readonly AppraisalItem[],
  { accountingLevel, brokerRelationsLevel, standing }: AppraisalNetFees,
  pricePercent = 100
): AppraisalNetTotals {
  let instantNet = 0;
  let listNet = 0;

  for (const raw of items) {
    const item = { ...raw, buy: scale(raw.buy, pricePercent), sell: scale(raw.sell, pricePercent) };
    if (item.buy !== null) {
      const buyTotal = item.buy * (item.buyWalk?.filled ?? item.quantity);
      instantNet += buyTotal - salesTax(buyTotal, accountingLevel, standing.feeDiscountFactor);
    }

    const undercut = appraisalUndercut(item);
    if (undercut !== null) {
      const listValue = undercut.price * item.quantity;
      const fee = brokerFee(
        listValue,
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding,
        standing.safetyTaxPct,
        standing.feeDiscountFactor
      );
      listNet += listValue - salesTax(listValue, accountingLevel, standing.feeDiscountFactor) - fee;
    }
  }

  return {
    instantNet,
    listNet,
    salesTaxPct: salesTaxPct(accountingLevel, standing.feeDiscountFactor),
    brokerFeePct: brokerFeePct(
      brokerRelationsLevel,
      standing.factionStanding,
      standing.corpStanding,
      standing.safetyTaxPct,
      standing.feeDiscountFactor
    ),
  };
}

export interface CompareMargin {
  spread: number | null;
  spreadPct: number | null;
  afterFees: number | null;
}

export function compareMargin(
  bestSell: number | null,
  bestBuy: number | null,
  { accountingLevel, brokerRelationsLevel, standing }: AppraisalNetFees
): CompareMargin {
  if (bestSell === null || bestBuy === null) {
    return { spread: null, spreadPct: null, afterFees: null };
  }
  const spread = bestSell - bestBuy;
  const broker = (value: number) =>
    brokerFee(
      value,
      brokerRelationsLevel,
      standing.factionStanding,
      standing.corpStanding,
      standing.safetyTaxPct,
      standing.feeDiscountFactor
    );
  return {
    spread,
    spreadPct: bestBuy > 0 ? (spread / bestBuy) * 100 : null,
    afterFees:
      spread -
      salesTax(bestSell, accountingLevel, standing.feeDiscountFactor) -
      broker(bestSell) -
      broker(bestBuy),
  };
}

export interface HubComparisonTotals {
  buy: number | null;
  sell: number | null;
}

export function buildHubComparison(
  items: readonly AppraisalItem[],
  pricePercent: number
): HubComparisonTotals {
  const { totals } = buildAppraisal(items, pricePercent);
  return {
    buy: items.some((item) => item.buy !== null) ? totals.buy : null,
    sell: items.some((item) => item.sell !== null) ? totals.sell : null,
  };
}

export interface AppraisalReprocessingEntry {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
  specialisationSkillId?: number;
}

export interface ComputeAppraisalRefineInput {
  quantity: number;
  reprocessing: AppraisalReprocessingEntry | undefined;
  modifiers: CharacterModifiers;
  materialPrices: Readonly<Record<number, number>>;
  materialSellPrices?: Readonly<Record<number, number>>;
  refining?: RefiningSetup;
}

export function computeAppraisalRefine({
  quantity,
  reprocessing,
  modifiers,
  materialPrices,
  materialSellPrices,
  refining = DEFAULT_REFINING_SETUP,
}: ComputeAppraisalRefineInput): AppraisalRefine | undefined {
  if (!reprocessing) return undefined;
  const efficiency = refiningEfficiency(
    modifiers,
    reprocessing.specialisationSkillId,
    refining.stationRate
  );
  return refineFromDetail(
    quantity,
    {
      portionSize: reprocessing.portionSize,
      materials: reprocessing.materials,
      efficiency,
      materialPrices,
      materialSellPrices,
    },
    refining.taxRate
  );
}

export function refineFromDetail(
  quantity: number,
  detail: AppraisalRefineDetail,
  taxRate: number
): AppraisalRefine {
  const yielded = reprocessingYield({
    portionSize: detail.portionSize,
    materials: detail.materials,
    units: quantity,
    efficiency: detail.efficiency,
  });
  const value = reprocessingValue(yielded.outputs, detail.materialPrices);
  const sellValue = detail.materialSellPrices
    ? reprocessingValue(yielded.outputs, detail.materialSellPrices)
    : undefined;
  return {
    valueAtFullPrice: netOfReprocessingTax(value.total, taxRate),
    pricedAll: value.pricedAll,
    unitsLeftOver: yielded.unitsLeftOver,
    ...(sellValue
      ? {
          sellValueAtFullPrice: netOfReprocessingTax(sellValue.total, taxRate),
          sellPricedAll: sellValue.pricedAll,
        }
      : {}),
    detail,
  };
}
