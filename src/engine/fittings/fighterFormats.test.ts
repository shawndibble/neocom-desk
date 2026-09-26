/**
 * Fighters through every format a Fitting leaves and comes back in: EFT, DNA
 * (chat link), the game's XML, and In-game Fittings (ESI).
 */
import { describe, expect, it } from 'vitest';
import { loadEftFitting, type EftSlotLookup } from './eftLoader';
import { fittingToEft as legacyEft } from './eftExport';
import { esiFittingToFitting, fittingToEsiFitting } from './esiFittingMapper';
import { fittingItemCounts, fittingToDna, fittingToEft, fittingToEveXml } from './fittingExport';
import { loadDnaFitting } from './linkLoader';
import type { Fitting } from './types';

const THANATOS = 23911;
const TEMPLAR_I = 23055;
const CENOBITE_I = 37599;
const NAMES: Record<number, string> = {
  [THANATOS]: 'Thanatos',
  [TEMPLAR_I]: 'Templar I',
  [CENOBITE_I]: 'Cenobite I',
};
const nameFor = (typeId: number) => NAMES[typeId] ?? `Type ${typeId}`;
const typeByName = {
  get: (name: string) => {
    const hit = Object.entries(NAMES).find(([, n]) => n.toLowerCase() === name);
    return hit ? { typeID: Number(hit[0]) } : undefined;
  },
};
const SLOTS: EftSlotLookup = {};

const carrier: Fitting = {
  name: 'Carrier',
  shipTypeId: THANATOS,
  modules: [],
  drones: [],
  cargo: [],
  fighters: [
    { typeId: TEMPLAR_I, quantity: 6, state: 'active' },
    { typeId: TEMPLAR_I, quantity: 6, state: 'online' },
    { typeId: CENOBITE_I, quantity: 3, state: 'active' },
  ],
};

describe('fighters in the formats', () => {
  it('prices and multibuys the fighters with everything else', () => {
    expect(fittingItemCounts(carrier).get(TEMPLAR_I)).toBe(12);
  });

  it('writes a squadron a line in EFT, and loads them back as squadrons, in the bay', () => {
    const eft = fittingToEft(carrier, nameFor);
    expect(eft).toContain('Templar I x6\nTemplar I x6\nCenobite I x3');
    expect(legacyEft(carrier, nameFor)).toContain('Templar I x6\nTemplar I x6\nCenobite I x3');

    const loaded = loadEftFitting(eft, typeByName, SLOTS);
    if (loaded.hullTypeId === null) throw new Error('no hull');
    expect(loaded.fighters).toEqual([
      { typeId: TEMPLAR_I, quantity: 6, state: 'online' },
      { typeId: TEMPLAR_I, quantity: 6, state: 'online' },
      { typeId: CENOBITE_I, quantity: 3, state: 'online' },
    ]);
    expect(loaded.cargo).toEqual([]);
  });

  it('carries them in DNA, splitting a stack back into squadrons', () => {
    const dna = fittingToDna(carrier);
    expect(dna).toContain(`${TEMPLAR_I};12`);
    const loaded = loadDnaFitting(dna, SLOTS);
    if (loaded.hullTypeId === null) throw new Error('no hull');
    expect(loaded.fighters?.map((f) => [f.typeId, f.quantity])).toEqual([
      [TEMPLAR_I, 6],
      [TEMPLAR_I, 6],
      [CENOBITE_I, 3],
    ]);
  });

  it('writes the fighter bay into the game’s XML', () => {
    expect(fittingToEveXml(carrier, nameFor)).toContain(
      '<hardware qty="12" slot="fighter bay" type="Templar I"/>'
    );
  });

  it('saves launched squadrons to tubes and the rest to the bay in an In-game Fitting, and reads them back', () => {
    const esi = fittingToEsiFitting(carrier, 'Carrier', '');
    expect(esi.items).toEqual([
      { flag: 'FighterTube0', quantity: 6, type_id: TEMPLAR_I },
      { flag: 'FighterBay', quantity: 6, type_id: TEMPLAR_I },
      { flag: 'FighterTube1', quantity: 3, type_id: CENOBITE_I },
    ]);
    const back = esiFittingToFitting({
      fitting_id: 1,
      name: 'Carrier',
      description: '',
      ship_type_id: THANATOS,
      items: esi.items,
    });
    expect(back.fitting.fighters).toEqual(carrier.fighters);
    expect(back.unresolved).toEqual([]);
  });
});

describe('fighters past the tubes', () => {
  it('never writes a tube ESI does not have: a sixth launched squadron goes to the bay', () => {
    const many: Fitting = {
      ...carrier,
      fighters: Array.from({ length: 6 }, () => ({
        typeId: TEMPLAR_I,
        quantity: 6,
        state: 'active' as const,
      })),
    };
    const flags = fittingToEsiFitting(many, 'C', '').items.map((item) => item.flag);
    expect(flags).toEqual([
      'FighterTube0',
      'FighterTube1',
      'FighterTube2',
      'FighterTube3',
      'FighterTube4',
      'FighterBay',
    ]);
  });
});
