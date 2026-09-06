import { describe, it, expect } from 'vitest';
import { ownedStockSale, compareUseOrSell } from './ownedStockSale';
import { SKILL_IDS, type MaterialCostLine } from './types';

const NO_SKILLS = {};

function line(over: Partial<MaterialCostLine> = {}): MaterialCostLine {
  return {
    typeID: 34,
    baseQuantity: 100,
    quantity: 100,
    ownedQuantity: 100,
    remainingQuantity: 0,
    unitPrice: 10,
    lineCost: 0,
    unpriced: false,
    ...over,
  };
}

describe('ownedStockSale', () => {
  it('sells owned units into buy orders with sales tax and no broker fee', () => {
    const sale = ownedStockSale([line()], { 34: 1_000 }, 'instant', NO_SKILLS);

    expect(sale.gross).toBeCloseTo(100_000, 6);
    expect(sale.salesTax).toBeCloseTo(7_500, 6); // 7.5% at Accounting 0
    expect(sale.brokerFee).toBe(0); // filling someone else's order lists nothing
    expect(sale.net).toBeCloseTo(92_500, 6);
    expect(sale.unpriced).toEqual([]);
  });

  it('charges a broker fee as well when the units are listed as a sell order', () => {
    const sale = ownedStockSale([line()], { 34: 1_000 }, 'order', NO_SKILLS);

    expect(sale.gross).toBeCloseTo(100_000, 6);
    expect(sale.salesTax).toBeCloseTo(7_500, 6);
    expect(sale.brokerFee).toBeCloseTo(3_000, 6); // 3% at Broker Relations 0
    expect(sale.net).toBeCloseTo(89_500, 6);
  });

  it('applies the 100 ISK broker minimum per listed stack', () => {
    const sale = ownedStockSale(
      [line({ quantity: 1, ownedQuantity: 1 })],
      { 34: 10 },
      'order',
      NO_SKILLS
    );

    expect(sale.brokerFee).toBeCloseTo(100, 6);
    expect(sale.net).toBeCloseTo(10 - 0.75 - 100, 6);
  });

  it('reads the character own fee skills', () => {
    const skills = { [SKILL_IDS.accounting]: 5, [SKILL_IDS.brokerRelations]: 5 };
    const sale = ownedStockSale([line()], { 34: 1_000 }, 'order', skills);

    expect(sale.salesTax).toBeCloseTo(3_375, 6); // 3.375% at Accounting V
    expect(sale.brokerFee).toBeCloseTo(1_500, 6); // 1.5% at Broker Relations V
  });

  it('ignores materials with nothing owned, and flags owned units with no price on this side', () => {
    const sale = ownedStockSale(
      [line({ ownedQuantity: 0, remainingQuantity: 100 }), line({ typeID: 35, ownedQuantity: 50 })],
      { 34: 10 },
      'instant',
      NO_SKILLS
    );

    // Nothing owned on 34, and 35 is owned but has no buy order to fill.
    expect(sale.lines).toEqual([]);
    expect(sale.gross).toBe(0);
    expect(sale.unpriced).toEqual([35]);
    expect(sale.ownedUnits).toBe(50);
  });
});

describe('compareUseOrSell', () => {
  it('says sell when the owned materials are worth more than the build profit', () => {
    const sale = ownedStockSale([line()], { 34: 1_000 }, 'instant', NO_SKILLS);
    const verdict = compareUseOrSell(500, sale);

    expect(verdict).toEqual({
      buildProfit: 500,
      sellNet: sale.net,
      advantage: 500 - sale.net,
      verdict: 'sell',
    });
  });

  it('says build when building nets more than liquidating the stock', () => {
    const sale = ownedStockSale([line()], { 34: 1_000 }, 'instant', NO_SKILLS);
    const verdict = compareUseOrSell(200_000, sale);

    expect(verdict?.verdict).toBe('build');
    expect(verdict?.advantage).toBeCloseTo(200_000 - sale.net, 6);
  });

  it('gives no verdict when the build has no profit figure or a material has no price', () => {
    const priced = ownedStockSale([line()], { 34: 1_000 }, 'instant', NO_SKILLS);
    expect(compareUseOrSell(null, priced)).toBeNull();

    const unpriced = ownedStockSale([line()], {}, 'instant', NO_SKILLS);
    expect(compareUseOrSell(500, unpriced)).toBeNull();
  });

  it('gives no verdict when nothing is owned — there is no stock to sell instead', () => {
    const nothing = ownedStockSale(
      [line({ ownedQuantity: 0, remainingQuantity: 100 })],
      { 34: 1_000 },
      'instant',
      NO_SKILLS
    );

    expect(compareUseOrSell(500, nothing)).toBeNull();
  });
});
