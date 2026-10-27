import { describe, expect, it } from 'vitest';
import type { EftSlotLookup, EftTypeLookup } from './eftLoader';
import { gameItemLookup } from './fitCurrency';
import type { KillmailVictim } from './linkLoader';
import { groupPopularFits, type HullLoss } from './popularFits';
import { checkWorkbenchFit } from './workbenchFitCheck';
import { matchWorkbenchSightings } from './workbenchSightings';

const HULL = 626;
const NAMES: Record<string, number> = {
  vexor: HULL,
  thorax: 627,
  'heavy neutron blaster ii': 100,
  'light neutron blaster ii': 101,
  'warp scrambler ii': 200,
  'damage control ii': 300,
  'medium auxiliary nano pump i': 400,
  'hammerhead ii': 500,
  'void m': 900,
  'null m': 901,
};
const TYPES: EftTypeLookup = {
  get: (name) => (name in NAMES ? { typeID: NAMES[name] } : undefined),
};
const SLOTS: EftSlotLookup = {
  100: 'high',
  101: 'high',
  200: 'medium',
  300: 'low',
  400: 'rig',
  500: 'drone',
};

type Item = NonNullable<KillmailVictim['items']>[number];
const item = (typeId: number, flag: number, destroyed = 1): Item => ({
  item_type_id: typeId,
  flag,
  quantity_destroyed: destroyed,
  singleton: 0,
});
const loss = (killmailId: number, items: Item[], time: string | null = null): HullLoss => ({
  killmailId,
  time,
  value: null,
  victim: { ship_type_id: HULL, items },
});

/** Two blasters (one loaded with Void), a scram, a DC and a rig. */
const FLOWN: Item[] = [
  item(100, 27),
  item(900, 27, 40),
  item(100, 28),
  item(200, 19),
  item(300, 11),
  item(400, 92),
];
const POPULAR = groupPopularFits(
  [
    loss(1, FLOWN, '2026-09-01T00:00:00Z'),
    loss(2, FLOWN, '2026-09-20T00:00:00Z'),
    loss(3, [...FLOWN, item(500, 87, 5)], null),
  ],
  SLOTS
);

const EFT = `[Vexor, Brawler]
Damage Control II

Warp Scrambler II

Heavy Neutron Blaster II, Null M
Heavy Neutron Blaster II

Medium Auxiliary Nano Pump I

Hammerhead II x3
Void M x500`;

/** The game's names: everything the loader reads, plus a filament its catalogue leaves out. */
const GAME_ITEMS = gameItemLookup([
  'Vexor',
  'Thorax',
  'Heavy Neutron Blaster II',
  'Fierce Exotic Filament',
  'Gravid Warp Scrambler',
]);

function checks(
  fits: { id: string; eft: string }[],
  isGameItem: (name: string) => boolean = GAME_ITEMS
) {
  return new Map(
    fits.map(({ id, eft }) => [
      id,
      checkWorkbenchFit(eft, {
        typeByName: TYPES,
        slotByTypeId: SLOTS,
        hullSlots: () => null,
        isGameItem,
      }),
    ])
  );
}

function match(
  fits: { id: string; eft: string }[],
  hullTypeId = HULL,
  isGameItem: (name: string) => boolean = GAME_ITEMS
) {
  return matchWorkbenchSightings(checks(fits, isGameItem), POPULAR, hullTypeId);
}

describe('matchWorkbenchSightings', () => {
  it("gives a fit with a Popular fit's modules that group's loss count and last seen", () => {
    expect(POPULAR).toHaveLength(1);
    expect(match([{ id: 'a', eft: EFT }])).toEqual(
      new Map([['a', { count: 3, lastSeen: '2026-09-20T00:00:00Z' }]])
    );
  });

  it('ignores charges, drones, cargo and the order modules are listed in', () => {
    const reordered = `[Vexor]
Heavy Neutron Blaster II
Heavy Neutron Blaster II, Void M
Warp Scrambler II
Damage Control II
Medium Auxiliary Nano Pump I`;
    expect(match([{ id: 'b', eft: reordered }]).get('b')?.count).toBe(3);
  });

  it('leaves out a fit with any module different', () => {
    const swapped = EFT.replace('Heavy Neutron Blaster II\n', 'Light Neutron Blaster II\n');
    const extra = EFT.replace('Damage Control II', 'Damage Control II\nDamage Control II');
    expect(
      match([
        { id: 'c', eft: swapped },
        { id: 'd', eft: extra },
      ]).size
    ).toBe(0);
  });

  it('leaves out a fit for another hull', () => {
    expect(match([{ id: 'e', eft: EFT.replace('[Vexor', '[Thorax') }]).size).toBe(0);
    expect(match([{ id: 'f', eft: EFT }], 627).size).toBe(0);
  });

  it("leaves out a fit with a line it can't read, rather than matching what's left", () => {
    const unknownModule = `${EFT}\nMystery Module II`.replace('Hammerhead II x3\n', '');
    expect(match([{ id: 'g', eft: unknownModule }]).size).toBe(0);
    expect(match([{ id: 'h', eft: 'not a fit' }]).size).toBe(0);
  });

  const WITH_FILAMENT = `${EFT}\n\nFierce Exotic Filament x1`;

  it('still matches a fit carrying a game item the catalog leaves out, like a filament in cargo', () => {
    expect(match([{ id: 'i', eft: WITH_FILAMENT }]).get('i')?.count).toBe(3);
  });

  it('leaves out a fit carrying an item the game no longer has', () => {
    expect(match([{ id: 'j', eft: WITH_FILAMENT }], HULL, () => false).size).toBe(0);
  });

  it('leaves out a fit with an unread fitted module, even one the game still has', () => {
    // A mutated module reads as a fitted line: dropped, the rest would equal the group.
    const mutated = EFT.replace('Warp Scrambler II', 'Warp Scrambler II\nGravid Warp Scrambler');
    expect(match([{ id: 'l', eft: mutated }]).size).toBe(0);
  });

  it('matches nothing when there are no Popular fits', () => {
    expect(matchWorkbenchSightings(checks([{ id: 'a', eft: EFT }]), [], HULL).size).toBe(0);
  });
});
