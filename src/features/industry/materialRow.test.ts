import { describe, it, expect } from 'vitest';
import { materialCostLines } from '@/engine/industry/sourcing';
import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { materialRowState } from './materialRow';

/** Built through the engine so a fixture can never claim a cost line the engine wouldn't produce. */
function line(quantity: number, hubPrices: HubPrices, sourcing?: MaterialSourcingMap) {
  const material: MaterialCostLine = materialCostLines(
    [{ typeID: 34, baseQuantity: quantity, quantity }],
    hubPrices,
    sourcing
  )[0];
  return (pricesReady = true) => materialRowState(material, sourcing, pricesReady);
}

describe('materialRowState', () => {
  it('reports a hub-priced row with its price and line total', () => {
    expect(line(1000, { 34: 5 })()).toEqual({
      priceSource: 'hub',
      unitPrice: 5,
      fullyOwned: false,
      lineCost: 5000,
    });
  });

  it('reports an overridden row as overridden', () => {
    const state = line(1000, { 34: 5 }, { 34: { overridePrice: 7 } })();
    expect(state.priceSource).toBe('override');
    expect(state.unitPrice).toBe(7);
    expect(state.lineCost).toBe(7000);
  });

  it('still reports an override that happens to equal the hub price', () => {
    // The tag cannot be derived by comparing numbers — this is why the raw
    // overrides are read rather than the resolved unit price.
    expect(line(1000, { 34: 5 }, { 34: { overridePrice: 5 } })().priceSource).toBe('override');
  });

  it('suppresses a hub price when prices could not be loaded', () => {
    expect(line(1000, { 34: 5 })(false)).toEqual({
      priceSource: 'none',
      unitPrice: null,
      fullyOwned: false,
      lineCost: null,
    });
  });

  it('keeps an override price when prices could not be loaded — it is the player’s own number', () => {
    const state = line(1000, { 34: 5 }, { 34: { overridePrice: 7 } })(false);
    expect(state.priceSource).toBe('override');
    expect(state.unitPrice).toBe(7);
    expect(state.lineCost).toBe(7000);
  });

  it('reports an unpriced remainder as unknown, not as zero', () => {
    expect(line(1000, {})()).toEqual({
      priceSource: 'none',
      unitPrice: null,
      fullyOwned: false,
      lineCost: null,
    });
  });

  it('costs a fully owned row at zero even with no price anywhere', () => {
    const state = line(1000, {}, { 34: { ownedQuantity: 1000 } })();
    expect(state.fullyOwned).toBe(true);
    expect(state.priceSource).toBe('none');
    expect(state.lineCost).toBe(0);
  });

  it('costs a fully owned row at zero even when prices could not be loaded', () => {
    expect(line(1000, { 34: 5 }, { 34: { ownedQuantity: 1000 } })(false).lineCost).toBe(0);
  });

  it('prices only the remainder of a partly owned row', () => {
    const state = line(1000, { 34: 5 }, { 34: { ownedQuantity: 400 } })();
    expect(state.fullyOwned).toBe(false);
    expect(state.lineCost).toBe(3000);
  });

  it('treats an owned quantity above the requirement as fully owned, not as a negative remainder', () => {
    const state = line(1000, { 34: 5 }, { 34: { ownedQuantity: 5000 } })();
    expect(state.fullyOwned).toBe(true);
    expect(state.lineCost).toBe(0);
  });
});
