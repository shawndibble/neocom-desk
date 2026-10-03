import { describe, expect, it, vi } from 'vitest';

vi.mock('./dogmaFittingEngine', () => ({
  checkCharges: vi.fn(),
  chargesMissingSkills: vi.fn(),
  compareCharges: vi.fn(),
}));

import { buildChargeChoices } from './useChargeChoices';

const catalogue = {
  types: {
    '238': { typeId: 238, name: 'Antimatter Charge L', marketGroupId: 1, volume: 0.025 },
    '21740': {
      typeId: 21740,
      name: 'Caldari Navy Antimatter Charge L',
      marketGroupId: 1,
      volume: 0.025,
    },
    '12807': { typeId: 12807, name: 'Spike L', marketGroupId: 1, volume: 0.025 },
  },
  variations: {
    types: {
      238: { parentTypeId: null, metaGroupId: 1 },
      21740: { parentTypeId: 238, metaGroupId: 4 },
      12807: { parentTypeId: 237, metaGroupId: 2 },
    },
    metaGroups: { 1: 'Tech I', 2: 'Tech II', 4: 'Faction' },
  },
} as unknown as Parameters<typeof buildChargeChoices>[0]['catalogue'];

const stat = (typeId: number, dps: number) => ({
  typeId,
  dps,
  optimal: 15_000,
  falloff: 18_000,
  damage: null,
  roundsPerMinute: 38,
  techLevel: typeId === 12807 ? 2 : 1,
});

describe('buildChargeChoices', () => {
  const choices = buildChargeChoices({
    typeIds: [21740, 238, 12807],
    stats: new Map([
      [238, stat(238, 380)],
      [21740, stat(21740, 437)],
      [12807, stat(12807, 280)],
    ]),
    skillMissing: new Set([12807]),
    prices: new Map([[238, 62]]),
    cargo: new Map([[238, 1000]]),
    catalogue,
  });
  const byId = (id: number) => choices.find((c) => c.typeId === id)!;

  it('files a faction charge under its Tech I parent, named by its prefix', () => {
    expect(byId(21740)).toMatchObject({
      tier: 'faction',
      baseTypeId: 238,
      baseName: 'Antimatter Charge L',
      faction: 'Caldari Navy',
    });
  });

  it('keeps a Tech II charge as its own type, even though the SDE gives it a parent', () => {
    expect(byId(12807)).toMatchObject({ tier: 'tech2', baseTypeId: 12807, skillMissing: true });
  });

  it('carries the price, cargo and engine figures; an unpriced charge is null', () => {
    expect(byId(238)).toMatchObject({ tier: 'tech1', price: 62, cargo: 1000, dps: 380 });
    expect(byId(21740).price).toBeNull();
  });

  it("carries a cap booster charge's capacitor figures, and leaves them off a weapon's", () => {
    const cap = {
      injection: 400,
      gjPerSecond: 26,
      boostsPerLoad: 3,
      capacitor: { stable: true as const, stablePercentage: 55 },
    };
    const [booster] = buildChargeChoices({
      typeIds: [238],
      stats: new Map([[238, { ...stat(238, 0), cap }]]),
      skillMissing: new Set(),
      prices: new Map(),
      cargo: new Map(),
      catalogue,
    });
    expect(booster?.cap).toEqual(cap);
    expect(byId(238)).not.toHaveProperty('cap');
  });

  it("carries a crystal's mining figures", () => {
    const mining = {
      m3PerSecond: 12,
      cycleSeconds: 37,
      residueChance: 0.376,
      residueMultiplier: 1,
      residueM3s: 4.5,
      removedM3s: 16.5,
    };
    const [crystal] = buildChargeChoices({
      typeIds: [238],
      stats: new Map([[238, { ...stat(238, 0), mining }]]),
      skillMissing: new Set(),
      prices: new Map(),
      cargo: new Map(),
      catalogue,
    });
    expect(crystal?.mining).toEqual(mining);
    expect(byId(238)).not.toHaveProperty('mining');
  });
});
