import { describe, it, expect, beforeEach } from 'vitest';
import { db, type BuildPlanRecord } from '@/db';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { applySourcingPatch, saveSourcingEdit } from './sourcingEdits';

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

const PLAN: BuildPlanRecord = {
  id: 'plan-1',
  characterId: 1,
  name: 'Rifter',
  blueprintTypeID: 683,
  runs: 1,
  me: 0,
  te: 0,
  facility: 'npcStation',
  rigLevel: 'none',
  security: 'highsec',
  hubId: 'jita',
  updatedAt: 1,
};

describe('saveSourcingEdit', () => {
  beforeEach(async () => {
    await db.buildPlans.clear();
    await db.buildPlans.put(PLAN);
  });

  it('persists the edit onto the plan record', async () => {
    await saveSourcingEdit(PLAN.id, 34, { ownedQuantity: 400 });
    const stored = await db.buildPlans.get(PLAN.id);
    expect(stored?.materialSourcing).toEqual({ 34: { ownedQuantity: 400 } });
    expect(stored?.updatedAt).toBeGreaterThan(PLAN.updatedAt);
  });

  it('merges against the stored record, so a second edit cannot drop the first', async () => {
    // Both edits are issued from the same rendered map (the empty one) — the
    // real hazard when tabbing straight from a row's owned quantity into its
    // override price, before the live query has re-emitted.
    await saveSourcingEdit(PLAN.id, 34, { ownedQuantity: 400 });
    await saveSourcingEdit(PLAN.id, 34, { overridePrice: 7 });
    const stored = await db.buildPlans.get(PLAN.id);
    expect(stored?.materialSourcing).toEqual({ 34: { ownedQuantity: 400, overridePrice: 7 } });
  });

  it('clears the field back off the record, leaving no empty map behind', async () => {
    await saveSourcingEdit(PLAN.id, 34, { overridePrice: 7 });
    await saveSourcingEdit(PLAN.id, 34, { overridePrice: undefined });
    const stored = await db.buildPlans.get(PLAN.id);
    expect(stored?.materialSourcing).toBeUndefined();
  });

  it('does nothing for a plan deleted mid-edit rather than resurrecting it', async () => {
    await db.buildPlans.delete(PLAN.id);
    await saveSourcingEdit(PLAN.id, 34, { ownedQuantity: 400 });
    expect(await db.buildPlans.get(PLAN.id)).toBeUndefined();
  });
});
