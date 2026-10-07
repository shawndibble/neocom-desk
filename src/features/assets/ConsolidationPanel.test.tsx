import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ConsolidationPanel } from './ConsolidationPanel';

const fanned = vi.hoisted(() => ({
  value: { entries: [], skipped: [] } as {
    entries: unknown[];
    skipped: { characterId: number; name: string }[];
  },
}));

vi.mock('@/features/character/assets', () => ({
  loadAllCharactersAssets: () => Promise.resolve(fanned.value),
}));
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: () => Promise.resolve(null),
}));
vi.mock('@/features/character/stations', () => ({
  loadStationName: (id: number) => Promise.resolve(`Station ${id}`),
  loadStationSystemId: () => Promise.resolve(30000142),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map([[34, 'Tritanium']])),
  loadTypePackagedVolumes: () => Promise.resolve(new Map([[34, 0.01]])),
}));

const entry = (characterId: number, name: string, locationId: number) => ({
  characterId,
  name,
  truncated: false,
  assets: [
    {
      item_id: characterId,
      type_id: 34,
      quantity: 1000,
      location_id: locationId,
      location_type: 'station',
      location_flag: 'Hangar',
      is_singleton: false,
    },
  ],
});

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ConsolidationPanel />
    </MemoryRouter>
  );

describe('ConsolidationPanel', () => {
  beforeEach(() => {
    fanned.value = { entries: [], skipped: [] };
  });

  it('asks for at least two Characters', async () => {
    fanned.value = { entries: [entry(1, 'Alice', 60003760)], skipped: [] };
    renderPanel();
    expect(await screen.findByText(/at least two Characters/i)).toBeTruthy();
  });

  it('offers the stations holding assets once two Characters are loaded', async () => {
    fanned.value = {
      entries: [entry(1, 'Alice', 60003760), entry(2, 'Bob', 60008494)],
      skipped: [{ characterId: 3, name: 'Cara' }],
    };
    renderPanel();
    expect(await screen.findByRole('combobox', { name: /bring everything to/i })).toBeTruthy();
    expect(screen.getByText(/Not fully read: Cara/)).toBeTruthy();
  });
});
