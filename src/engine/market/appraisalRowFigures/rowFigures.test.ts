import { describe, it, expect } from 'vitest';
import {
  buildAppraisal,
  computeAppraisalRefine,
  type AppraisalItem,
  type AppraisalNetFees,
  type AppraisalRow,
  type RefineBasis,
} from '@/engine/market/appraisal';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { pileFigures, rowFigures } from '@/engine/market/appraisalRowFigures';

const refine = (row: AppraisalRow, basis: RefineBasis = 'buy') =>
  rowFigures(row, basis, null).refine;
const refineWins = (row: AppraisalRow, basis: RefineBasis = 'buy') =>
  refine(row, basis).verdict === 'refine';

describe('the refine verdict (issue #1048)', () => {
  function row(overrides: Partial<AppraisalRow> = {}): AppraisalRow {
    return {
      typeId: 1,
      name: 'Mercoxit III-Grade',
      quantity: 100,
      buyEach: 16_000,
      sellEach: 17_000,
      buyTotal: 1_600_000,
      sellTotal: 1_700_000,
      volume: null,
      refineTotal: 1_700_000,
      refinePricedAll: true,
      refineUnitsLeftOver: 0,
      ...overrides,
    };
  }

  it('compares the two totals directly when the quantity is whole batches', () => {
    expect(refine(row()).verdict).toBe('refine');
    expect(refine(row({ refineTotal: 1_500_000 })).verdict).toBe('sellAsIs');
  });

  it('values the leftover units the refine path still holds, at the sell-as-is price', () => {
    const paste = row({
      quantity: 999,
      buyTotal: 15_984_000,
      refineTotal: 15_436_890,
      refineUnitsLeftOver: 99,
    });
    expect(refineWins(paste)).toBe(true);
  });

  it('still calls a genuine loss for selling, leftover included', () => {
    const paste = row({
      quantity: 999,
      buyTotal: 15_984_000,
      refineTotal: 14_000_000,
      refineUnitsLeftOver: 99,
    });
    expect(refine(paste).verdict).toBe('sellAsIs');
  });

  it('does not call a tie for refining: below one batch, both paths are the same goods', () => {
    const partBatch = row({
      quantity: 99,
      buyTotal: 1_584_000,
      refineTotal: 0,
      refineUnitsLeftOver: 99,
    });
    expect(refine(partBatch).verdict).toBe('sellAsIs');
  });

  it('makes no claim on a row with no reprocessing data', () => {
    const none = row({
      refineTotal: undefined,
      refinePricedAll: undefined,
      refineUnitsLeftOver: undefined,
    });
    expect(refine(none)).toEqual({
      minerals: undefined,
      withLeftover: undefined,
      pricedAll: undefined,
      verdict: null,
    });
  });

  it('is no refine win when nobody is buying, rather than valuing the leftover at zero', () => {
    const unpriced = row({
      quantity: 999,
      buyEach: null,
      buyTotal: null,
      refineTotal: 15_436_890,
      refineUnitsLeftOver: 99,
    });
    expect(refineWins(unpriced)).toBe(false);
  });
});

describe('the split each price', () => {
  const at = (buyEach: number | null, sellEach: number | null) =>
    rowFigures(
      {
        typeId: 34,
        name: 'Tritanium',
        quantity: 1,
        buyEach,
        sellEach,
        buyTotal: buyEach,
        sellTotal: sellEach,
        volume: null,
      },
      'buy',
      null
    ).splitEach;

  it('is the midpoint of the buy and sell each price', () => {
    expect(at(5, 7)).toBe(6);
  });

  it('is null when either side has no price, never half a price or zero', () => {
    expect(at(null, 7)).toBeNull();
    expect(at(5, null)).toBeNull();
    expect(at(null, null)).toBeNull();
  });
});

describe('the sell fees', () => {
  const standing = { factionStanding: 0, corpStanding: 0 };
  const fees = (accountingLevel: number, brokerRelationsLevel: number): AppraisalNetFees => ({
    accountingLevel,
    brokerRelationsLevel,
    standing,
  });
  const selling = (sellTotal: number | null): AppraisalRow => ({
    typeId: 34,
    name: 'Tritanium',
    quantity: 1,
    buyEach: null,
    sellEach: sellTotal,
    buyTotal: null,
    sellTotal,
    volume: null,
  });
  const feesOn = (sellTotal: number | null, f: AppraisalNetFees | null) =>
    rowFigures(selling(sellTotal), 'buy', f).fees;

  it('charges the Accounting-reduced sales tax on the row sell total', () => {
    const tax = feesOn(1_000_000, fees(5, 0)).salesTax;
    expect(tax).toBeCloseTo((1_000_000 * salesTaxPct(5)) / 100, 6);
    expect(feesOn(1_000_000, fees(0, 0)).salesTax).toBeGreaterThan(tax as number);
  });

  it('charges the broker fee on the row sell total, with its 100 ISK minimum', () => {
    expect(feesOn(1_000_000, fees(0, 5)).brokerFee).toBeCloseTo(
      (1_000_000 * brokerFeePct(5)) / 100,
      6
    );
    expect(feesOn(10, fees(0, 5)).brokerFee).toBe(100);
  });

  it('gives the sell total less sales tax and broker fee', () => {
    const { salesTax, brokerFee, afterFees } = feesOn(1_000_000, fees(4, 3));
    expect(afterFees).toBeCloseTo(1_000_000 - (salesTax as number) - (brokerFee as number), 6);
  });

  it('is null where nothing sells, or the skills are not known yet, never a free 0', () => {
    const none = { salesTax: null, brokerFee: null, afterFees: null };
    expect(feesOn(null, fees(3, 3))).toEqual(none);
    expect(feesOn(1_000_000, null)).toEqual(none);
  });
});

describe('the figures on each price basis', () => {
  const base = {
    quantity: 1050,
    reprocessing: { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] },
    modifiers: NO_CHARACTER_MODIFIERS,
    refining: { stationRate: 0.5, taxRate: 0.1 },
    materialPrices: { 34: 5 },
    materialSellPrices: { 34: 8 },
  };
  const item = (): AppraisalItem => ({
    typeId: 1230,
    name: 'Veldspar',
    quantity: 1050,
    buy: 10,
    sell: 14,
    refine: computeAppraisalRefine(base),
  });

  it('picks the refine figure, the as-is total and the verdict by basis', () => {
    const row = buildAppraisal([item()], 100).rows[0];
    const on = (basis: RefineBasis) => rowFigures(row, basis, null);
    expect(on('buy').refine.minerals).toBe(row.refineTotal);
    expect(on('buy').refine.withLeftover).toBeCloseTo(9_000 + 50 * 10, 6);
    expect(on('sell').refine.withLeftover).toBeCloseTo(14_400 + 50 * 14, 6);
    expect(on('split').refine.withLeftover).toBeCloseTo((9_000 + 14_400) / 2 + 50 * 12, 6);
    expect(on('buy').asIs.total).toBe(10_500);
    expect(on('sell').asIs.total).toBe(14_700);
    expect(on('split').asIs.total).toBe(12_600);
    expect(on('buy').refine.verdict).toBe('sellAsIs');
    expect(on('sell').refine.verdict).toBe('refine');
  });

  it('has no split or sell answer where a side is missing', () => {
    const row = buildAppraisal([{ ...item(), sell: null }], 100).rows[0];
    expect(rowFigures(row, 'sell', null).asIs.total).toBeNull();
    expect(rowFigures(row, 'split', null).asIs.total).toBeNull();
    expect(rowFigures(row, 'sell', null).refine.verdict).not.toBe('refine');
  });

  it('flags a floor on the basis whose side had an unpriced mineral, and on the split', () => {
    const refineData = computeAppraisalRefine({ ...base, materialSellPrices: {} });
    const row = buildAppraisal([{ ...item(), refine: refineData }], 100).rows[0];
    expect(rowFigures(row, 'buy', null).refine.pricedAll).toBe(true);
    expect(rowFigures(row, 'sell', null).refine.pricedAll).toBe(false);
    expect(rowFigures(row, 'split', null).refine.pricedAll).toBe(false);
  });

  it('gives no split refine figure where a mineral had no price on one side, rather than half of the other', () => {
    const untaxed = { ...base, refining: { stationRate: 0.5, taxRate: 0 } };
    const at = (materialSellPrices: Record<number, number>) =>
      buildAppraisal(
        [{ ...item(), refine: computeAppraisalRefine({ ...untaxed, materialSellPrices }) }],
        100
      ).rows[0];
    expect(rowFigures(at({ 34: 8 }), 'split', null).refine.withLeftover).toBeCloseTo(
      13_000 + 50 * 12,
      6
    );
    const oneSided = at({});
    expect(rowFigures(oneSided, 'split', null).refine.withLeftover).toBeUndefined();
    expect(rowFigures(oneSided, 'buy', null).refine.withLeftover).toBeCloseTo(10_500, 6);
  });

  it('sums the pile minerals on the basis over the rows that have a figure', () => {
    const plain: AppraisalItem = { typeId: 34, name: 'Tritanium', quantity: 1, buy: 5, sell: 6 };
    const { rows } = buildAppraisal([item(), plain, item()], 100);
    expect(pileFigures(rows, 'buy')).toEqual({ refineMinerals: 18_000, refinable: true });
    expect(pileFigures(rows, 'sell').refineMinerals).toBeCloseTo(28_800, 6);
    expect(pileFigures(buildAppraisal([plain], 100).rows, 'buy')).toEqual({
      refineMinerals: 0,
      refinable: false,
    });
  });
});
