import { describe, it, expect } from 'vitest';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { applySourcingPatch } from './sourcingEdits';

describe('applySourcingPatch', () => {
  it('sets an owned quantity on a plan that had no sourcing at all', () => {
    expect(applySourcingPatch(undefined, 34, { ownedQuantity: 500 })).toEqual({
      34: { ownedQuantity: 500 },
    });
  });

  it('sets an override price without disturbing the owned quantity already stored', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500 } };
    expect(applySourcingPatch(map, 34, { overridePrice: 7.25 })).toEqual({
      34: { ownedQuantity: 500, overridePrice: 7.25 },
    });
  });

  it('leaves other materials untouched', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500 }, 35: { overridePrice: 12 } };
    expect(applySourcingPatch(map, 34, { overridePrice: 7 })).toEqual({
      34: { ownedQuantity: 500, overridePrice: 7 },
      35: { overridePrice: 12 },
    });
  });

  it('does not mutate the map it was given', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500 } };
    applySourcingPatch(map, 34, { overridePrice: 7 });
    expect(map).toEqual({ 34: { ownedQuantity: 500 } });
  });

  it('clears an override price while keeping the owned quantity', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500, overridePrice: 7.25 } };
    expect(applySourcingPatch(map, 34, { overridePrice: undefined })).toEqual({
      34: { ownedQuantity: 500 },
    });
  });

  it('drops the entry entirely once its last field is cleared', () => {
    const map: MaterialSourcingMap = { 34: { overridePrice: 7.25 }, 35: { ownedQuantity: 1 } };
    expect(applySourcingPatch(map, 34, { overridePrice: undefined })).toEqual({
      35: { ownedQuantity: 1 },
    });
  });

  it('collapses to undefined when clearing the only entry, so the field can be omitted', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500 } };
    expect(applySourcingPatch(map, 34, { ownedQuantity: undefined })).toBeUndefined();
  });

  it('keeps an owned quantity above the required amount — the engine clamps, this is not an error', () => {
    expect(applySourcingPatch(undefined, 34, { ownedQuantity: 999_999 })).toEqual({
      34: { ownedQuantity: 999_999 },
    });
  });

  it('keeps a zero override price — free is a real price, not an absent one', () => {
    expect(applySourcingPatch(undefined, 34, { overridePrice: 0 })).toEqual({
      34: { overridePrice: 0 },
    });
  });

  it('treats a garbage value as a cleared field rather than storing it', () => {
    const map: MaterialSourcingMap = { 34: { ownedQuantity: 500 } };
    expect(applySourcingPatch(map, 34, { ownedQuantity: Number.NaN })).toBeUndefined();
  });
});
