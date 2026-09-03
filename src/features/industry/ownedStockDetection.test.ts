import { describe, expect, it, vi } from 'vitest';
import type { OwnedStockPlacement } from '@/engine/industry/ownedStock';

const loadAllCharactersAssets = vi.fn();
vi.mock('@/features/character/assets', () => ({
  loadAllCharactersAssets: () => loadAllCharactersAssets(),
}));

const { loadOwnedStockSnapshot, stockLocationLabel } = await import('./ownedStockDetection');

const ASSET = {
  item_id: 1,
  type_id: 34,
  quantity: 10,
  location_id: 60003760,
  location_type: 'station' as const,
  location_flag: 'Hangar',
  is_singleton: false,
};

/** Stands in for i18next: enough to tell which fallback key fired, with its id interpolated. */
const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}:${opts ? Object.values(opts).join(',') : ''}`;

function placement(overrides: Partial<OwnedStockPlacement> = {}): OwnedStockPlacement {
  return {
    characterId: 91,
    locationId: 60003760,
    locationType: 'station',
    quantity: 5,
    ...overrides,
  };
}

describe('loadOwnedStockSnapshot', () => {
  it('turns every readable Character into an engine source, keeping its name', async () => {
    loadAllCharactersAssets.mockResolvedValue({
      entries: [
        { characterId: 91, name: 'Main Pilot', assets: [ASSET], truncated: false },
        { characterId: 92, name: 'Alt Pilot', assets: [], truncated: false },
      ],
      skipped: [],
    });

    const snapshot = await loadOwnedStockSnapshot();

    expect(snapshot.sources).toEqual([
      { characterId: 91, assets: [ASSET] },
      { characterId: 92, assets: [] },
    ]);
    expect(snapshot.characterNames.get(92)).toBe('Alt Pilot');
    expect(snapshot.incompleteCharacters).toEqual([]);
  });

  it('names both truncated and skipped Characters as incomplete, in one sorted list', async () => {
    // Either kind of gap makes the totals a floor, and the UI names them
    // together — a player only cares which Characters it could not see.
    loadAllCharactersAssets.mockResolvedValue({
      entries: [
        { characterId: 91, name: 'Zara Pilot', assets: [ASSET], truncated: true },
        { characterId: 92, name: 'Whole Pilot', assets: [ASSET], truncated: false },
      ],
      skipped: [{ characterId: 93, name: 'No Scope Pilot' }],
    });

    const snapshot = await loadOwnedStockSnapshot();

    expect(snapshot.incompleteCharacters).toEqual(['No Scope Pilot', 'Zara Pilot']);
    expect(snapshot.sources).toHaveLength(2);
  });
});

describe('stockLocationLabel', () => {
  it('prefers a resolved name', () => {
    expect(stockLocationLabel(placement(), new Map([[60003760, 'Jita IV - Moon 4']]), t)).toBe(
      'Jita IV - Moon 4'
    );
  });

  it('falls back to the id-based station label', () => {
    expect(stockLocationLabel(placement(), new Map(), t)).toBe('assets.stationLabel:60003760');
  });

  it('falls back to the id-based structure label for an unresolvable structure', () => {
    // Structure names are ACL-checked and can fail even for a Character with
    // assets sitting inside one.
    expect(
      stockLocationLabel(
        placement({ locationType: 'other', locationId: 1035466617946 }),
        new Map(),
        t
      )
    ).toBe('assets.structureLabel:1035466617946');
  });

  it('labels a parent ESI never returned a row for as a structure', () => {
    expect(
      stockLocationLabel(
        placement({ locationType: 'item', locationId: 1035466617946 }),
        new Map(),
        t
      )
    ).toBe('assets.structureLabel:1035466617946');
  });

  it('labels stock in space by system, named when it resolves', () => {
    const inSpace = placement({ locationType: 'solar_system', locationId: 30000142 });
    expect(stockLocationLabel(inSpace, new Map([[30000142, 'Jita']]), t)).toBe(
      'assets.inSpaceNamedLabel:Jita'
    );
    expect(stockLocationLabel(inSpace, new Map(), t)).toBe('assets.inSpaceLabel:30000142');
  });
});
