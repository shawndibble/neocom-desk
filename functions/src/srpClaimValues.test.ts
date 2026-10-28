import { describe, expect, it } from 'vitest';
import { claimValuesOf, parseClaimValuesInput } from './srpClaimValues.js';
import type { SrpKillmailSource } from './srpKillmail.js';
import type { DoctrineFit } from './srpTypes.js';

// 405 is a high-slot module, 421 a mid-slot one and 4395 a rig in the SDE's fitting racks.
const PRICES = new Map([
  [10, 100],
  [405, 10],
  [421, 5],
  [4395, 2],
]);
const source = {
  jitaValue: async (items: ReadonlyMap<number, number>) => {
    let sum = 0;
    for (const [id, q] of items) {
      const p = PRICES.get(id);
      if (p === undefined) return null;
      sum += p * q;
    }
    return sum;
  },
} as unknown as SrpKillmailSource;

const victim = {
  characterId: 1,
  corporationId: 2,
  shipTypeId: 10,
  items: [
    { item_type_id: 405, flag: 27, quantity_destroyed: 1 },
    { item_type_id: 405, flag: 28, quantity_destroyed: 1 },
    { item_type_id: 421, flag: 5, quantity_destroyed: 50 }, // cargo
  ],
};
const doctrine: DoctrineFit = {
  id: 'd',
  name: 'Fleet Hull',
  snapshot: { hullTypeId: 10, name: 'x', modules: [405, 405, 421], rigs: [4395] },
  createdBy: 1,
  createdAt: 0,
};

describe('claimValuesOf', () => {
  it('prices hull and fit without cargo, and the doctrine whole', async () => {
    expect(await claimValuesOf(source, victim, doctrine)).toEqual({
      hullValue: 100,
      fitValue: 20,
      doctrineValue: 100 + 20 + 5 + 2,
      doctrineName: 'Fleet Hull',
    });
  });
  it('has no doctrine value without a doctrine', async () => {
    expect(await claimValuesOf(source, victim, undefined)).toEqual({
      hullValue: 100,
      fitValue: 20,
      doctrineValue: null,
    });
  });
  it('is null where a type has no price', async () => {
    const odd = { ...victim, items: [{ item_type_id: 405, flag: 27, quantity_destroyed: 1 }] };
    expect((await claimValuesOf(source, odd, undefined)).fitValue).toBeNull();
  });
});

describe('parseClaimValuesInput', () => {
  it('takes a killmail id and refuses anything else', () => {
    expect(parseClaimValuesInput({ killmailId: 5 })).toEqual({ killmailId: 5 });
    expect(() => parseClaimValuesInput({ killmailId: '5' })).toThrow();
    expect(() => parseClaimValuesInput(null)).toThrow();
  });
});
