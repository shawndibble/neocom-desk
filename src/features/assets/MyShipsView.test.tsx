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
  loadTypes: async () => ({
    '100': { name: 'Catalyst', groupID: 1 },
    '101': { name: 'Bestower', groupID: 1 },
  }),
  loadGroupCategories: async () => ({ '1': 6 }),
}));
vi.mock('@/features/character/location', () => ({ loadCharacterSolarSystemId: async () => null }));
vi.mock('@/features/places', () => ({
  placeKey: () => '',
  usePlaceDetails: () => new Map(),
}));
vi.mock('@/features/market/itemActions', () => ({ useItemActions: () => ({ showInfo: vi.fn() }) }));
vi.mock('@/features/market/ItemContextMenu', () => ({
  ShowInfoMenuItem: () => null,
  OpenInEveItemMenuItems: () => null,
}));
vi.mock('@/features/fittings/useOpenInFittings', () => ({
  useOpenInFittings: () => ({ open: vi.fn(), pending: false }),
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
        route={{ rules: { preference: 'shortest' } } as never}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  read.entries = [];
  read.skipped = [];
  read.cachedAt = null;
});

const shipAsset = (over: Record<string, unknown>) =>
  ({
    type_id: 100,
    quantity: 1,
    location_id: 60000001,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: true,
    ...over,
  }) as never;

describe('MyShipsView packaged ships', () => {
  it('marks a packaged stack with a Packaged pill and its quantity, without Show fitting', async () => {
    read.entries = [
      {
        characterId: 1,
        name: 'Alice',
        assets: [
          shipAsset({ item_id: 1, is_singleton: false, quantity: 10 }),
          shipAsset({ item_id: 2, type_id: 101 }),
        ],
      },
    ];
    renderShips([1]);
    expect(await screen.findByText('Packaged')).toBeInTheDocument();
    expect(screen.getAllByText('Packaged')).toHaveLength(1);
    expect(screen.getByText('×10')).toBeInTheDocument();
    expect(screen.getByText('Bestower')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /more actions|actions/i })[0]);
    expect(screen.getByRole('menuitem', { name: 'Open location assets' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Show fitting' })).not.toBeInTheDocument();
  });

  it('finds packaged rows by searching "packaged"', async () => {
    read.entries = [
      {
        characterId: 1,
        name: 'Alice',
        assets: [
          shipAsset({ item_id: 1, is_singleton: false, quantity: 1 }),
          shipAsset({ item_id: 2, type_id: 101 }),
        ],
      },
    ];
    renderShips([1]);
    await screen.findByText('Bestower');
    await userEvent.type(screen.getByRole('searchbox'), 'packaged');
    expect(screen.queryByText('Bestower')).not.toBeInTheDocument();
    expect(screen.getByText('Catalyst')).toBeInTheDocument();
    expect(screen.queryByText('×1')).not.toBeInTheDocument();
  });

  it('says what holds a ship that sits in a bay', async () => {
    read.entries = [
      {
        characterId: 1,
        name: 'Alice',
        assets: [
          shipAsset({ item_id: 2, type_id: 101 }),
          shipAsset({
            item_id: 3,
            location_id: 2,
            location_type: 'item',
            location_flag: 'ShipHangar',
          }),
        ],
      },
    ];
    renderShips([1]);
    expect(await screen.findByText('inside Bestower (Ship Maintenance Bay)')).toBeInTheDocument();
  });
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
