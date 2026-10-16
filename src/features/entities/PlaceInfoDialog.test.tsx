import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { memoryPlaceSource } from '@/features/places/testSource';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PlaceInfoDialog, type PlaceInfoSource } from './PlaceInfoDialog';

const STRUCTURE = 1_030_000_000_000;

const source: PlaceInfoSource = {
  place: memoryPlaceSource({
    stations: {
      60003760: { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
    },
    structures: {
      [`7:${STRUCTURE}`]: { name: 'Perimeter - Tranquility Trading Tower', systemId: 30000144 },
    },
    systems: {
      30000142: { name: 'Jita', security: 0.95 },
      30000144: { name: 'Perimeter', security: 0.9 },
    },
  }),
  regionName: async (id) => (id === 10000002 ? 'The Forge' : null),
  systemRegionId: async () => 10000002,
};

function renderPlace(id: number) {
  return render(
    <MemoryRouter>
      <PlaceInfoDialog id={id} onClose={vi.fn()} source={source} />
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
    expect(await screen.findByText('The Forge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set destination/ })).toBeInTheDocument();
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

  it('says it cannot find an id that is no place', async () => {
    renderPlace(20000020);
    expect(await screen.findByText("Can't find this place")).toBeInTheDocument();
  });
});
