import { describe, expect, it } from 'vitest';
import { gameItemLookup } from './fitCurrency';
import { checkWorkbenchFit, type WorkbenchGameData } from './workbenchFitCheck';

const data: WorkbenchGameData = {
  typeByName: new Map([
    ['vexor', { typeID: 626 }],
    ['heavy neutron blaster ii', { typeID: 3001 }],
    ['damage control ii', { typeID: 2048 }],
    ['void m', { typeID: 12789 }],
    ['hammerhead ii', { typeID: 2185 }],
  ]),
  slotByTypeId: { 3001: 'high', 2048: 'low', 2185: 'drone' },
  hullSlots: () => ({ high: 4, medium: 4, low: 5, rig: 3 }),
  isGameItem: gameItemLookup([
    'Vexor',
    'Heavy Neutron Blaster II',
    'Damage Control II',
    'Fierce Exotic Filament',
    'Large Abyssal Shield Extender',
  ]),
};

describe('checkWorkbenchFit', () => {
  it('a fit that loads cleanly is current, and can be seen on zKillboard', () => {
    const check = checkWorkbenchFit(
      '[Vexor, A]\nDamage Control II\n\nHeavy Neutron Blaster II',
      data
    );
    expect(check.verdict).toEqual({ current: true });
    expect(check.hullTypeId).toBe(626);
    expect(check.sightingKey).toBe('2048,3001');
  });

  it('keeps the modules it loaded, rack and type only', () => {
    const check = checkWorkbenchFit(
      '[Vexor, A]\nDamage Control II\n\nHeavy Neutron Blaster II, Void M',
      data
    );
    expect(check.modules).toEqual([
      { slot: 'high', typeId: 3001 },
      { slot: 'low', typeId: 2048 },
    ]);
  });

  it('keeps the whole fit as item counts for pricing: hull, modules, charges, drones, cargo', () => {
    const check = checkWorkbenchFit(
      [
        '[Vexor, A]',
        'Damage Control II',
        '',
        'Heavy Neutron Blaster II, Void M',
        'Heavy Neutron Blaster II, Void M',
        '',
        'Hammerhead II x5',
        '',
        'Void M x1000',
      ].join('\n'),
      data
    );
    expect(new Map(check.items)).toEqual(
      new Map([
        [626, 1],
        [2048, 1],
        [3001, 2],
        [12789, 1002],
        [2185, 5],
      ])
    );
  });

  it('an item the game no longer has makes the fit out of date, keeps what did load, and is never seen', () => {
    const check = checkWorkbenchFit('[Vexor, A]\nOld Gun I\nHeavy Neutron Blaster II', data);
    expect(check.verdict).toEqual({
      current: false,
      reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
    });
    expect(check.modules).toEqual([{ slot: 'high', typeId: 3001 }]);
    expect(new Map(check.items)).toEqual(
      new Map([
        [626, 1],
        [3001, 1],
      ])
    );
    expect(check.sightingKey).toBeNull();
  });

  it('an unread item the game still has leaves the fit current and still matchable', () => {
    // A filament in cargo: the loader's catalogue leaves filaments out (#2513, #2536).
    const check = checkWorkbenchFit(
      '[Vexor, A]\nHeavy Neutron Blaster II\n\n\nFierce Exotic Filament x3',
      data
    );
    expect(check.verdict).toEqual({ current: true });
    expect(check.sightingKey).toBe('3001');
  });

  it('an unread fitted module stays current but is never matched, though the game has it', () => {
    // A mutated module reads as a fitted line: dropped, the rest could equal a smaller group.
    const check = checkWorkbenchFit(
      '[Vexor, A]\nHeavy Neutron Blaster II\nLarge Abyssal Shield Extender',
      data
    );
    expect(check.verdict).toEqual({ current: true });
    expect(check.sightingKey).toBeNull();
  });

  it('with the game’s names unreadable, an unread item is neither removed nor matched on', () => {
    const check = checkWorkbenchFit('[Vexor, A]\nHeavy Neutron Blaster II\n\nMystery Thing x1', {
      ...data,
      isGameItem: null,
    });
    expect(check.verdict).toEqual({ current: true });
    expect(check.sightingKey).toBeNull();
  });

  it('a line that overflows a rack is never matched on what is left', () => {
    const check = checkWorkbenchFit(`[Vexor, A]\n${'Heavy Neutron Blaster II\n'.repeat(9)}`, data);
    expect(check.sightingKey).toBeNull();
  });

  it('has no modules, items or sighting for a hull the game no longer knows', () => {
    const check = checkWorkbenchFit('[Gone Hull, A]', data);
    expect(check.hullTypeId).toBeNull();
    expect(check.modules).toEqual([]);
    expect(check.items).toEqual([]);
    expect(check.sightingKey).toBeNull();
  });
});
