import { describe, expect, it } from 'vitest';
import {
  depthCandidates,
  depthPriceMap,
  summedDepthNeeds,
  walkSellBook,
  type DepthNeedSource,
} from './depthPrice';
import type { MaterialCostLine } from './types';

const HUB = 60003760;
const ELSEWHERE = 60008494;

const sell = (price: number, volume_remain: number, location_id = HUB) => ({
  price,
  volume_remain,
  location_id,
  is_buy_order: false,
});

describe('walkSellBook', () => {
  it('averages the levels it takes when the book covers the need exactly', () => {
    const depth = walkSellBook([sell(5, 100), sell(4, 100)], HUB, 200);
    expect(depth).toEqual({
      best: 4,
      avg: 4.5,
      need: 200,
      filled: 200,
      listed: 200,
      covered: true,
      levels: [
        { price: 4, units: 100, listed: 100 },
        { price: 5, units: 100, listed: 100 },
      ],
    });
  });

  it('takes part of the last level it reaches', () => {
    const depth = walkSellBook([sell(4, 100), sell(5, 100), sell(6, 100)], HUB, 150);
    expect(depth?.levels).toEqual([
      { price: 4, units: 100, listed: 100 },
      { price: 5, units: 50, listed: 100 },
    ]);
    expect(depth?.avg).toBeCloseTo((400 + 250) / 150);
    expect(depth?.covered).toBe(true);
  });

  it('prices a need one level covers at that level', () => {
    const depth = walkSellBook([sell(4, 100), sell(4, 50), sell(9, 10)], HUB, 120);
    expect(depth?.levels).toEqual([{ price: 4, units: 120, listed: 150 }]);
    expect(depth?.avg).toBe(4);
  });

  it('reports a shortfall at the average of what is listed', () => {
    const depth = walkSellBook([sell(4, 100), sell(6, 100)], HUB, 500);
    expect(depth).toMatchObject({ filled: 200, listed: 200, need: 500, covered: false, avg: 5 });
  });

  it('only counts sell orders at the hub station', () => {
    const depth = walkSellBook(
      [sell(1, 1000, ELSEWHERE), { ...sell(2, 1000), is_buy_order: true }, sell(4, 100)],
      HUB,
      50
    );
    expect(depth).toMatchObject({ best: 4, avg: 4, listed: 100 });
  });

  it('is null when nothing is listed at the station', () => {
    expect(walkSellBook([sell(1, 1000, ELSEWHERE)], HUB, 10)).toBeNull();
  });

  it('is null for no need', () => {
    expect(walkSellBook([sell(4, 100)], HUB, 0)).toBeNull();
  });
});

const line = (typeID: number, remainingQuantity: number): MaterialCostLine => ({
  typeID,
  baseQuantity: remainingQuantity,
  quantity: remainingQuantity,
  ownedQuantity: 0,
  remainingQuantity,
  unitPrice: 1,
  lineCost: remainingQuantity,
  unpriced: false,
});

describe('depthCandidates', () => {
  const volumes = { 34: 1000, 35: 1000 };

  it('keeps a need at 1% or more of the units listed', () => {
    const needs = depthCandidates([line(34, 10), line(35, 9)], volumes, undefined, 'sell');
    expect([...needs]).toEqual([[34, 10]]);
  });

  it('sums a type that appears on several lines', () => {
    const needs = depthCandidates([line(35, 5), line(35, 5)], volumes, undefined, 'sell');
    expect([...needs]).toEqual([[35, 10]]);
  });

  it('walks nothing on the buy basis', () => {
    expect(depthCandidates([line(34, 500)], volumes, undefined, 'buy').size).toBe(0);
  });

  it('skips a row the pilot priced, and a type nothing is listed for', () => {
    const needs = depthCandidates(
      [line(34, 500), line(36, 500), line(37, 500)],
      { ...volumes, 37: 0 },
      { 34: { overridePrice: 3 } },
      'sell'
    );
    expect(needs.size).toBe(0);
  });

  it('skips a fully owned row', () => {
    expect(depthCandidates([line(34, 0)], volumes, undefined, 'sell').size).toBe(0);
  });
});

describe('summedDepthNeeds', () => {
  const member = (hubId: string, lines: MaterialCostLine[]): DepthNeedSource => ({
    hubId,
    lines,
    sellVolumes: { 34: 1000 },
    sourcing: undefined,
    basis: 'sell',
  });

  it('tests the threshold on the group total, once per hub and type', () => {
    // 6 + 6 = 12 units: neither member alone reaches 1% of 1,000, the group does.
    const needs = summedDepthNeeds([member('jita', [line(34, 6)]), member('jita', [line(34, 6)])]);
    expect([...needs.get('jita')!]).toEqual([[34, 12]]);
  });

  it('keeps hubs apart', () => {
    const needs = summedDepthNeeds([member('jita', [line(34, 6)]), member('amarr', [line(34, 6)])]);
    expect(needs.size).toBe(0);
  });

  it('leaves out a member pricing a type itself or buying on the buy basis', () => {
    const needs = summedDepthNeeds([
      member('jita', [line(34, 20)]),
      { ...member('jita', [line(34, 500)]), sourcing: { 34: { overridePrice: 1 } } },
      { ...member('jita', [line(34, 500)]), basis: 'buy' },
    ]);
    expect([...needs.get('jita')!]).toEqual([[34, 20]]);
  });
});

describe('depthPriceMap', () => {
  it('maps each walk to its average', () => {
    const depth = walkSellBook([sell(4, 100), sell(6, 100)], HUB, 200)!;
    expect(depthPriceMap(new Map([[34, depth]]))).toEqual({ 34: 5 });
  });
});
