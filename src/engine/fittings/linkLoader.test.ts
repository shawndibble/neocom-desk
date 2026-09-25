import { describe, expect, it } from 'vitest';
import {
  classifyLoadInput,
  loadDnaFitting,
  killmailVictimToLoadResult,
  type KillmailVictim,
} from './linkLoader';
import type { EftSlotLookup } from './eftLoader';

const SLOTS: EftSlotLookup = {
  100: 'high',
  200: 'medium',
  300: 'low',
  400: 'rig',
  500: 'drone',
};

describe('classifyLoadInput', () => {
  it('recognises a bare DNA string', () => {
    expect(classifyLoadInput('587:100;2:200;1::')).toEqual({
      kind: 'dna',
      dna: '587:100;2:200;1::',
    });
  });

  it('recognises an in-game chat link', () => {
    expect(classifyLoadInput('<url=fitting:587:100;1::>My Rifter</url>')).toEqual({
      kind: 'dna',
      dna: '587:100;1::',
    });
    expect(classifyLoadInput('fitting:587:100;1::')).toEqual({ kind: 'dna', dna: '587:100;1::' });
  });

  it('reads DNA out of an eveship.fit link', () => {
    expect(classifyLoadInput('https://eveship.fit/?fit=587:100;1::')).toEqual({
      kind: 'dna',
      dna: '587:100;1::',
    });
  });

  it('tolerates a dna: tag on an eveship.fit link', () => {
    expect(classifyLoadInput('https://eveship.fit/?fit=dna:587:100;1::')).toEqual({
      kind: 'dna',
      dna: '587:100;1::',
    });
  });

  it('reads EFT out of an eveship.fit link', () => {
    const eft = '[Rifter, x]\n125mm Gatling AutoCannon I';
    const url = `https://eveship.fit/?fit=${encodeURIComponent(eft)}`;
    expect(classifyLoadInput(url)).toEqual({ kind: 'eft', text: eft });
  });

  it('recognises EFT text', () => {
    expect(classifyLoadInput('[Rifter, x]\nfoo')).toEqual({
      kind: 'eft',
      text: '[Rifter, x]\nfoo',
    });
  });

  it('recognises zKillboard and ESI killmail links', () => {
    expect(classifyLoadInput('https://zkillboard.com/kill/12345/')).toEqual({
      kind: 'killmail',
      killmailId: 12345,
    });
    const hash = 'a'.repeat(40);
    expect(classifyLoadInput(`https://esi.evetech.net/latest/killmails/12345/${hash}/`)).toEqual({
      kind: 'killmail',
      killmailId: 12345,
      hash,
    });
  });

  it('marks anything else unknown', () => {
    expect(classifyLoadInput('hello world')).toEqual({ kind: 'unknown' });
    expect(classifyLoadInput('https://example.com/')).toEqual({ kind: 'unknown' });
  });
});

describe('loadDnaFitting', () => {
  it('buckets by rack, expands slotted quantities, and sends the rest to cargo', () => {
    const result = loadDnaFitting('587:100;2:200;1:400;1:500;5:999;3::', SLOTS);
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.hullTypeId).toBe(587);
    expect(result.modules.map((m) => [m.slot, m.slotIndex, m.typeId])).toEqual([
      ['high', 0, 100],
      ['high', 1, 100],
      ['medium', 0, 200],
      ['rig', 0, 400],
    ]);
    expect(result.drones).toEqual([{ typeId: 500, quantity: 5, state: 'online' }]);
    expect(result.cargo).toEqual([{ typeId: 999, quantity: 3 }]);
  });

  it('reports rack overflow as unresolved', () => {
    const result = loadDnaFitting('587:100;9::', SLOTS);
    expect(result.unresolved).toHaveLength(1);
  });
});

describe('killmailVictimToLoadResult', () => {
  const victim: KillmailVictim = {
    ship_type_id: 587,
    items: [
      { item_type_id: 100, flag: 27, quantity_destroyed: 1, singleton: 0 },
      { item_type_id: 9000, flag: 27, quantity_dropped: 40, singleton: 0 }, // its charge
      { item_type_id: 200, flag: 20, quantity_dropped: 1, singleton: 0 },
      { item_type_id: 300, flag: 11, quantity_destroyed: 1, singleton: 0 },
      { item_type_id: 400, flag: 92, quantity_destroyed: 1, singleton: 0 },
      { item_type_id: 500, flag: 87, quantity_destroyed: 2, quantity_dropped: 1, singleton: 0 },
      { item_type_id: 999, flag: 5, quantity_dropped: 7, singleton: 0 },
      { item_type_id: 998, flag: 5, quantity_destroyed: 1, singleton: 0 },
      { item_type_id: 997, flag: 5, singleton: 0 }, // nothing lost or dropped
    ],
  };

  it('maps flags to slots, folds charges in, and sums destroyed with dropped', () => {
    const result = killmailVictimToLoadResult(victim, SLOTS);
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.hullTypeId).toBe(587);
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 100, state: 'active', chargeTypeId: 9000 },
      { slot: 'medium', slotIndex: 1, typeId: 200, state: 'active' },
      { slot: 'low', slotIndex: 0, typeId: 300, state: 'active' },
      { slot: 'rig', slotIndex: 0, typeId: 400, state: 'active' },
    ]);
    expect(result.drones).toEqual([{ typeId: 500, quantity: 3, state: 'online' }]);
    expect(result.cargo).toEqual([
      { typeId: 999, quantity: 7 },
      { typeId: 998, quantity: 1 },
    ]);
  });
});
