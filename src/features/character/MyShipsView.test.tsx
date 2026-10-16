import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { MyShipsView } from './MyShipsView';

const read = vi.hoisted(() => ({
  entries: [] as { characterId: number; name: string; assets: never[] }[],
  skipped: [] as { characterId: number; name: string }[],
}));
vi.mock('./assets', () => ({
  loadOtherCharactersAssetsDetailed: vi.fn(async () => ({
    entries: read.entries,
    skipped: read.skipped,
  })),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({}),
  loadGroupCategories: async () => ({}),
}));
vi.mock('./location', () => ({ loadCharacterSolarSystemId: async () => null }));
vi.mock('@/features/places', () => ({
  placeKey: () => '',
  usePlaceDetails: () => new Map(),
}));
vi.mock('@/features/market/groupNames', () => ({ loadGroupNames: async () => new Map() }));

function renderShips(characterIds: number[]) {
  return render(
    <MemoryRouter>
      <MyShipsView
        characterIds={characterIds}
        activeCharacterId={characterIds[0] ?? null}
        hrefFor={() => '/assets'}
        route={'shortest' as never}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  read.entries = [];
  read.skipped = [];
});

describe('MyShipsView with unreadable assets', () => {
  it('says "No ships found" only for assets that were actually read', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    renderShips([1]);
    expect(await screen.findByText('No ships found')).toBeInTheDocument();
    expect(screen.queryByText(/missing here/)).not.toBeInTheDocument();
  });

  it('names a skipped Character beside the ships that did load', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    read.skipped = [{ characterId: 2, name: 'Bob' }];
    renderShips([1, 2]);
    expect(
      await screen.findAllByText("Couldn't load assets for Bob — they are missing here.")
    ).not.toHaveLength(0);
  });

  it('shows "couldn\'t load" with Retry, not "No ships found", when every Character was skipped', async () => {
    read.skipped = [{ characterId: 1, name: 'Alice' }];
    renderShips([1]);
    expect(await screen.findAllByText("Couldn't load — try again")).not.toHaveLength(0);
    expect(screen.queryByText('No ships found')).not.toBeInTheDocument();

    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    read.skipped = [];
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No ships found')).toBeInTheDocument();
  });
});
