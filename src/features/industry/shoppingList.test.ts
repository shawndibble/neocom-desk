import { describe, it, expect } from 'vitest';
import { materialCostLines } from '@/engine/industry/sourcing';
import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { hasShoppingList, shoppingListText } from './shoppingList';

const nameFor = (typeID: number) => `Item ${typeID}`;

/** Built through the engine so the fixtures can never drift from what the panel copies. */
function line(
  typeID: number,
  baseQuantity: number,
  quantity: number,
  hubPrices: HubPrices = {},
  sourcing?: MaterialSourcingMap
): MaterialCostLine {
  return materialCostLines([{ typeID, baseQuantity, quantity }], hubPrices, sourcing)[0];
}

describe('shoppingListText', () => {
  it('writes one tab-separated name and quantity per line', () => {
    const text = shoppingListText([line(34, 1000, 1000), line(35, 200, 200)], nameFor);
    expect(text).toBe('Item 34\t1000\nItem 35\t200');
  });

  it('subtracts what the player already owns', () => {
    const owned = line(34, 1000, 1000, {}, { 34: { ownedQuantity: 400 } });
    expect(shoppingListText([owned], nameFor)).toBe('Item 34\t600');
  });

  it('drops a fully owned material — nothing left to buy', () => {
    const owned = line(34, 1000, 1000, {}, { 34: { ownedQuantity: 1000 } });
    const short = line(35, 200, 200);
    expect(shoppingListText([owned, short], nameFor)).toBe('Item 35\t200');
  });

  it('lists a material the plan advises building, like every other material', () => {
    // The list carries no verdict: make-or-buy is about how to spend, not what
    // the shopping trip needs.
    const advised = line(9840, 12, 12, { 9840: 100 });
    expect(shoppingListText([advised], nameFor)).toBe('Item 9840\t12');
  });

  it('writes quantities as raw digits, with no thousands separators', () => {
    // A grouped "1,234,567" is not a number EVE multibuy accepts.
    const large = line(34, 1234567, 1234567);
    expect(shoppingListText([large], nameFor)).toBe('Item 34\t1234567');
  });

  it('is empty when nothing is left to buy', () => {
    const owned = line(34, 1000, 1000, {}, { 34: { ownedQuantity: 1000 } });
    expect(shoppingListText([owned], nameFor)).toBe('');
  });
});

describe('hasShoppingList', () => {
  it('is false for no materials at all', () => {
    expect(hasShoppingList([])).toBe(false);
  });

  it('is false when every material is fully owned', () => {
    const owned = line(34, 1000, 1000, {}, { 34: { ownedQuantity: 1000 } });
    expect(hasShoppingList([owned])).toBe(false);
  });

  it('is true when one material still has a remainder', () => {
    const owned = line(34, 1000, 1000, {}, { 34: { ownedQuantity: 1000 } });
    const short = line(35, 200, 200, {}, { 35: { ownedQuantity: 199 } });
    expect(hasShoppingList([owned, short])).toBe(true);
  });
});
