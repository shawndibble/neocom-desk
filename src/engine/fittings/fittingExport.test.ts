import { describe, expect, it } from 'vitest';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { classifyLoadInput, loadDnaFitting } from './linkLoader';
import { loadEftFitting, type EftSlotLookup } from './eftLoader';
import {
  fittingItemCounts,
  fittingToChatLink,
  fittingToDna,
  fittingToEft,
  fittingToMultibuy,
} from './fittingExport';
import type { Fitting } from './types';

const NAMES: Record<number, string> = {
  587: 'Rifter',
  1: '200mm AutoCannon II',
  2: '5MN Microwarpdrive II',
  3: 'Damage Control II',
  4: 'Small Core Defense Field Extender I',
  5: 'EMP S',
  6: 'Hobgoblin II',
  7: 'Nanite Repair Paste',
};
const SLOTS: EftSlotLookup = {
  1: 'high',
  2: 'medium',
  3: 'low',
  4: 'rig',
  6: 'drone',
};
const nameFor = (typeId: number) => NAMES[typeId] ?? `Type ${typeId}`;
const typeByName = {
  get: (name: string) => {
    const hit = Object.entries(NAMES).find(([, n]) => n.toLowerCase() === name);
    return hit ? { typeID: Number(hit[0]) } : undefined;
  },
};

const FITTING: Fitting = {
  name: 'Brawler',
  shipTypeId: 587,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 1, state: 'active', chargeTypeId: 5 },
    { slot: 'high', slotIndex: 1, typeId: 1, state: 'active', chargeTypeId: 5 },
    { slot: 'medium', slotIndex: 0, typeId: 2, state: 'offline' },
    { slot: 'low', slotIndex: 0, typeId: 3, state: 'active' },
    { slot: 'rig', slotIndex: 0, typeId: 4, state: 'online' },
  ],
  drones: [{ typeId: 6, quantity: 5, state: 'online' }],
  cargo: [{ typeId: 7, quantity: 100 }],
};

const DNA = '587:1;2:2;1:3;1:4;1:5;2:6;5:7;100::';

describe('fittingItemCounts', () => {
  it('counts hull, modules, charges, drones and cargo with quantities', () => {
    expect(Object.fromEntries(fittingItemCounts(FITTING))).toEqual({
      587: 1,
      1: 2,
      5: 2,
      2: 1,
      3: 1,
      4: 1,
      6: 5,
      7: 100,
    });
  });
});

describe('fittingToEft', () => {
  it('writes header, racks low to high, charges, /OFFLINE, drones and cargo', () => {
    expect(fittingToEft(FITTING, nameFor)).toBe(
      [
        '[Rifter, Brawler]',
        'Damage Control II',
        '',
        '5MN Microwarpdrive II /OFFLINE',
        '',
        '200mm AutoCannon II, EMP S',
        '200mm AutoCannon II, EMP S',
        '',
        'Small Core Defense Field Extender I',
        '',
        'Hobgoblin II x5',
        '',
        'Nanite Repair Paste x100',
      ].join('\n')
    );
  });

  it('round-trips through the EFT loader', () => {
    const loaded = loadEftFitting(fittingToEft(FITTING, nameFor), typeByName, SLOTS);
    expect(loaded.hullTypeId).toBe(587);
    if (loaded.hullTypeId === null) return;
    expect(loaded.unresolved).toEqual([]);
    expect(loaded.modules.map((m) => [m.slot, m.typeId, m.chargeTypeId])).toEqual(
      FITTING.modules.map((m) => [m.slot, m.typeId, m.chargeTypeId])
    );
    expect(loaded.drones).toEqual(FITTING.drones);
    expect(loaded.cargo).toEqual(FITTING.cargo);
  });

  it('keeps a hostile name from breaking the header', () => {
    const text = fittingToEft({ ...FITTING, name: 'a]\nb' }, nameFor);
    expect(text.split('\n')[0]).toBe('[Rifter, a b]');
  });
});

describe('DNA and chat link', () => {
  it('folds identical modules and includes charges, drones and cargo', () => {
    expect(fittingToDna(FITTING)).toBe(DNA);
  });

  it('round-trips through classify and the DNA loader', () => {
    const input = classifyLoadInput(fittingToChatLink(FITTING));
    expect(input.kind).toBe('dna');
    if (input.kind !== 'dna') return;
    const loaded = loadDnaFitting(input.dna, SLOTS);
    expect(loaded.hullTypeId).toBe(587);
    if (loaded.hullTypeId === null) return;
    expect(loaded.modules.map((m) => [m.slot, m.typeId])).toEqual([
      ['high', 1],
      ['high', 1],
      ['medium', 2],
      ['low', 3],
      ['rig', 4],
    ]);
    expect(loaded.drones).toEqual(FITTING.drones);
    expect(loaded.cargo).toEqual([
      { typeId: 5, quantity: 2 },
      { typeId: 7, quantity: 100 },
    ]);
  });

  it('keeps a name from closing the link markup early', () => {
    expect(fittingToChatLink({ ...FITTING, name: 'a</url>b' })).toBe(
      `<url=fitting:${DNA}>a /url b</url>`
    );
  });

  it('wraps the DNA in the game link markup under the fitting name', () => {
    expect(fittingToChatLink(FITTING)).toBe(`<url=fitting:${DNA}>Brawler</url>`);
  });
});

describe('fittingToMultibuy', () => {
  it('lists every item once with raw-digit quantities, tab separated', () => {
    const lines = fittingToMultibuy(FITTING, nameFor).split('\n');
    expect(lines).toContain('Rifter\t1');
    expect(lines).toContain('200mm AutoCannon II\t2');
    expect(lines).toContain('EMP S\t2');
    expect(lines).toContain('Hobgoblin II\t5');
    expect(lines).toContain('Nanite Repair Paste\t100');
    expect(lines).toHaveLength(8);
  });

  it('reads back through the Appraisal paste parser', () => {
    const entries = parseAppraisalPaste(fittingToMultibuy(FITTING, nameFor));
    expect(entries.find((e) => e.name === '200mm AutoCannon II')?.quantity).toBe(2);
    expect(entries.find((e) => e.name === 'Rifter')?.quantity).toBe(1);
    expect(entries).toHaveLength(8);
  });
});
