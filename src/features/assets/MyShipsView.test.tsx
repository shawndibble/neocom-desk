import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { MyShipsView } from './MyShipsView';

const read = vi.hoisted(() => ({
  entries: [] as { characterId: number; name: string; assets: never[] }[],
  skipped: [] as { characterId: number; name: string }[],
  cachedAt: null as number | null,
}));
vi.mock('./assets', () => ({
  loadOtherCharactersAssetsDetailed: vi.fn(async () => ({
    entries: read.entries,
    skipped: read.skipped,
    cachedAt: read.cachedAt,
  })),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({}),
  loadGroupCategories: async () => ({}),
}));
vi.mock('@/features/character/location', () => ({ loadCharacterSolarSystemId: async () => null }));
vi.mock('@/features/places', () => ({
  placeKey: () => '',
  usePlaceDetails: () => new Map(),
}));
vi.mock('@/features/market/groupNames', () => ({ loadGroupNames: async () => new Map() }));

function renderShips(
  characterIds: number[],
  onSkippedChange?: (names: readonly string[] | undefined) => void
) {
  return render(
    <MemoryRouter>
      <MyShipsView
        characterIds={characterIds}
        onSkippedChange={onSkippedChange}
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
  read.cachedAt = null;
});

describe('MyShipsView with unreadable assets', () => {
  it('says "No ships found" only for assets that were actually read', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    renderShips([1]);
    expect(await screen.findByText('No ships found')).toBeInTheDocument();
    expect(screen.queryByText(/missing here/)).not.toBeInTheDocument();
  });

  it('hands a skipped Character up to the header picker instead of naming it in the body', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    read.skipped = [{ characterId: 2, name: 'Bob' }];
    const onSkippedChange = vi.fn();
    renderShips([1, 2], onSkippedChange);
    await waitFor(() => expect(onSkippedChange).toHaveBeenLastCalledWith(['Bob']));
    expect(screen.queryByText(/missing here/)).not.toBeInTheDocument();
  });

  it('shows "couldn\'t load" with Retry, not "No ships found", when every Character was skipped', async () => {
    read.skipped = [{ characterId: 1, name: 'Alice' }];
    renderShips([1]);
    expect(await screen.findAllByText("Couldn't load")).not.toHaveLength(0);
    expect(screen.queryByText('No ships found')).not.toBeInTheDocument();

    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    read.skipped = [];
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No ships found')).toBeInTheDocument();
  });
});

describe('MyShipsView with saved-copy assets', () => {
  it('says the list is cached, with the age of the oldest saved read', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    read.cachedAt = Date.now() - 3 * 3_600_000 - 60_000;
    renderShips([1]);
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('says nothing when every list came from ESI', async () => {
    read.entries = [{ characterId: 1, name: 'Alice', assets: [] }];
    renderShips([1]);
    expect(await screen.findByText('No ships found')).toBeInTheDocument();
    expect(screen.queryByText('Showing cached data')).not.toBeInTheDocument();
  });
});
