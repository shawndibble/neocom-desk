import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';

const STRUCTURE = 1_030_000_000_000;

vi.mock('@/features/character/stations', () => ({
  loadStationName: vi.fn(async (id: number) =>
    id === 60003760 ? 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' : null
  ),
  loadStationSystemId: vi.fn(async (id: number) => (id === 60003760 ? 30000142 : null)),
}));
vi.mock('@/features/character/structures', () => ({
  loadStructureName: vi.fn(async (characterId: number) =>
    characterId === 7 ? 'Perimeter - Tranquility Trading Tower' : null
  ),
  loadStructureSystemId: vi.fn(async (characterId: number) =>
    characterId === 7 ? 30000144 : null
  ),
}));
vi.mock('@/features/character/systemSecurity', () => ({
  loadSystemName: vi.fn(
    async (id: number) => ({ 30000142: 'Jita', 30000144: 'Perimeter' })[id] ?? null
  ),
  loadSystemSecurity: vi.fn(async () => 0.9),
}));
vi.mock('@/features/places/regions', () => ({
  loadRegionName: vi.fn(async (id: number) => (id === 10000002 ? 'The Forge' : null)),
  loadSystemRegionId: vi.fn(async () => 10000002),
}));

import { useActiveCharacter } from '@/stores/activeCharacter';
import { db } from '@/db';
import { writeCached } from '@/esi/cache';
import { seedCharacter } from '@/test/seed';
import { PlaceInfoDialog } from './PlaceInfoDialog';

function renderPlace(id: number) {
  return render(
    <MemoryRouter>
      <PlaceInfoDialog id={id} onClose={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
});

describe('PlaceInfoDialog', () => {
  it('shows a station, its system and region, and where to go', async () => {
    renderPlace(60003760);
    expect(
      await screen.findByRole('heading', { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' })
    ).toBeInTheDocument();
    expect(screen.getByText('Station')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Jita' })).toHaveAttribute(
      'href',
      expect.stringMatching(/30000142/)
    );
    expect(await screen.findByRole('link', { name: 'The Forge' })).toHaveAttribute(
      'href',
      '/?info=place-10000002'
    );
    expect(screen.getByRole('button', { name: /Set destination/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Your assets here' })).toBeNull();
  });

  it('links to the assets a Character holds at the station', async () => {
    await seedCharacter(7, 'Hauler');
    await writeCached(
      7,
      'assets',
      [
        {
          item_id: 1,
          type_id: 34,
          quantity: 5,
          location_id: 60003760,
          location_type: 'station',
          location_flag: 'Hangar',
        },
      ],
      Date.now()
    );
    try {
      renderPlace(60003760);
      expect(await screen.findByRole('link', { name: 'Your assets here' })).toHaveAttribute(
        'href',
        expect.stringContaining('60003760')
      );
    } finally {
      await db.esiCache.clear();
      await db.characters.clear();
    }
  });

  it('shows a structure the active Character can dock at', async () => {
    renderPlace(STRUCTURE);
    expect(
      await screen.findByRole('heading', { name: 'Perimeter - Tranquility Trading Tower' })
    ).toBeInTheDocument();
    expect(screen.getByText('Structure')).toBeInTheDocument();
  });

  it("says it can't read a structure the Character has no access to", async () => {
    useActiveCharacter.setState({ activeCharacterId: 8, hydrated: true });
    renderPlace(STRUCTURE);
    expect(await screen.findByText("Can't read this structure")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set destination/ })).toBeNull();
  });

  it('shows a region by name, with no destination', async () => {
    renderPlace(10000002);
    expect(await screen.findByRole('heading', { name: 'The Forge' })).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set destination/ })).toBeNull();
  });

  it('says it cannot find a constellation or a solar system', async () => {
    renderPlace(20000020);
    expect(await screen.findByText("Can't find this place")).toBeInTheDocument();
  });

  it('is not a view of a solar system: those open Route Safety', async () => {
    renderPlace(30000142);
    expect(await screen.findByText("Can't find this place")).toBeInTheDocument();
  });

  it('says a structure read failed, not that the Character has no access', async () => {
    const { loadStructureName } = await import('@/features/character/structures');
    vi.mocked(loadStructureName).mockRejectedValueOnce(new Error('network'));
    renderPlace(STRUCTURE);
    expect(await screen.findByText('Couldn’t load this place')).toBeInTheDocument();
    expect(screen.queryByText("Can't read this structure")).toBeNull();
  });
});
