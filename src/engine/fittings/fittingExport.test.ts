import { describe, expect, it } from 'vitest';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { classifyLoadInput, loadDnaFitting } from './linkLoader';
import { loadEftFitting, type EftSlotLookup } from './eftLoader';
import {
  fittingItemCounts,
  fittingToChatLink,
  fittingToDna,
  fittingToEft,
  fittingToEveXml,
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

  it("counts the Fitting's own implants and boosters, one of each", () => {
    const counts = fittingItemCounts({
      ...FITTING,
      implantSet: { implants: [8, 9], boosters: [10], boosterSideEffects: [2737] },
    });
    expect(counts.get(8)).toBe(1);
    expect(counts.get(9)).toBe(1);
    expect(counts.get(10)).toBe(1);
    expect(counts.has(2737)).toBe(false);
  });

  it('leaves out implants already in the clone, never a booster', () => {
    // A set seeded from the clone (8, 9) with one implant and a booster added.
    const seeded: Fitting = { ...FITTING, implantSet: { implants: [8, 9, 11], boosters: [10] } };
    const counts = fittingItemCounts(seeded, [8, 9, 10]);
    expect(counts.has(8)).toBe(false);
    expect(counts.has(9)).toBe(false);
    expect(counts.get(11)).toBe(1);
    expect(counts.get(10)).toBe(1);
  });

  it('never leaves out a module, charge, drone or cargo item that matches a clone implant', () => {
    expect(fittingItemCounts(FITTING, [1, 5, 6, 7])).toEqual(fittingItemCounts(FITTING));
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

  it('subtracts owned stock and drops fully covered lines', () => {
    const owned = new Map([
      [1, 1],
      [587, 1],
      [7, 500],
    ]);
    const lines = fittingToMultibuy(FITTING, nameFor, [], owned).split('\n');
    expect(lines).toContain('200mm AutoCannon II\t1');
    expect(lines.some((l) => l.startsWith('Rifter'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Nanite Repair Paste'))).toBe(false);
    expect(lines).toHaveLength(6);
  });

  it("includes the Fitting's own implants and boosters", () => {
    const names: Record<number, string> = {
      8: "Zor's Custom Navigation Hyper-Link",
      9: 'Snake Alpha',
      10: 'Synth Blue Pill Booster',
    };
    const withSet: Fitting = { ...FITTING, implantSet: { implants: [8, 9], boosters: [10] } };
    const lines = fittingToMultibuy(withSet, (id) => names[id] ?? nameFor(id)).split('\n');
    expect(lines).toContain("Zor's Custom Navigation Hyper-Link\t1");
    expect(lines).toContain('Snake Alpha\t1');
    expect(lines).toContain('Synth Blue Pill Booster\t1');
    expect(lines).toHaveLength(11);
  });

  it('leaves out implants the clone already has', () => {
    const withSet: Fitting = { ...FITTING, implantSet: { implants: [8, 9], boosters: [10] } };
    const lines = fittingToMultibuy(withSet, nameFor, [8]).split('\n');
    expect(lines).not.toContain('Type 8\t1');
    expect(lines).toContain('Type 9\t1');
    expect(lines).toContain('Type 10\t1');
  });

  it('reads back through the Appraisal paste parser', () => {
    const entries = parseAppraisalPaste(fittingToMultibuy(FITTING, nameFor));
    expect(entries.find((e) => e.name === '200mm AutoCannon II')?.quantity).toBe(2);
    expect(entries.find((e) => e.name === 'Rifter')?.quantity).toBe(1);
    expect(entries).toHaveLength(8);
  });
});

describe('fittingToEveXml', () => {
  it("writes the game's fittings XML: hi/med/low/rig slots, drone bay, and cargo with the loaded charges", () => {
    expect(fittingToEveXml(FITTING, nameFor)).toBe(
      [
        '<?xml version="1.0" ?>',
        '<fittings>',
        '  <fitting name="Brawler">',
        '    <description value=""/>',
        '    <shipType value="Rifter"/>',
        '    <hardware slot="low slot 0" type="Damage Control II"/>',
        '    <hardware slot="med slot 0" type="5MN Microwarpdrive II"/>',
        '    <hardware slot="hi slot 0" type="200mm AutoCannon II"/>',
        '    <hardware slot="hi slot 1" type="200mm AutoCannon II"/>',
        '    <hardware slot="rig slot 0" type="Small Core Defense Field Extender I"/>',
        '    <hardware qty="5" slot="drone bay" type="Hobgoblin II"/>',
        '    <hardware qty="100" slot="cargo" type="Nanite Repair Paste"/>',
        '    <hardware qty="2" slot="cargo" type="EMP S"/>',
        '  </fitting>',
        '</fittings>',
        '',
      ].join('\n')
    );
  });

  it('escapes what XML attributes cannot hold', () => {
    const odd: Fitting = {
      ...FITTING,
      name: 'Tom & "Jerry" <3>',
      modules: [],
      drones: [],
      cargo: [],
    };
    expect(fittingToEveXml(odd, nameFor)).toContain(
      '<fitting name="Tom &amp; &quot;Jerry&quot; &lt;3&gt;">'
    );
  });
});
