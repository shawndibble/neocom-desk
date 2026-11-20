import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { RosterRow } from './CorpRoster';
import { PlayersView } from './PlayersView';
import type { RosterGrouping } from './useRosterGrouping';

const HOUR = 3_600_000;
const row = (characterId: number, name: string, hours: number): RosterRow => ({
  characterId,
  name,
  standing: {
    characterId,
    lastSeenMs: 0,
    neverSeen: false,
    darkForMs: hours * HOUR,
    isDark: hours >= 14 * 24,
  },
  shipName: `Ship ${characterId}`,
  shipTypeId: null,
  locationName: null,
  locationId: null,
  startMs: null,
  roles: null,
  isSelf: false,
  isCeo: false,
});

const rows = [
  row(1, 'Kestrel Vane', 2),
  row(2, 'Vane Hauler', 24),
  row(5, 'Sora Tenn', 5),
  row(10, 'Lena Voss', 1),
];
const NAMES = new Map([
  [4, 'Outer Rim Vane'],
  [6, 'Sora Of Elsewhere'],
]);
const edit = vi.fn();

function grouping(over: Partial<RosterGrouping> = {}): RosterGrouping {
  return {
    canGroup: true,
    groupOf: () => undefined,
    names: NAMES,
    groups: [
      { id: 'solo:1', mainCharacterId: 1, characterIds: [1, 2, 4], officerClaimed: [4] },
      { id: 'solo:5', mainCharacterId: 5, characterIds: [5, 6], provenCharacterIds: [6] },
    ],
    conflictIds: new Set(),
    declinedIds: new Set(),
    reload: vi.fn(),
    source: {
      status: 'ready',
      choices: [],
      stored: [],
      name: (id) => rows.find((r) => r.characterId === id)?.name ?? NAMES.get(id) ?? `#${id}`,
      edit: (a) => edit(a),
      searchAs: 1,
    },
    ...over,
  };
}

const onGroupWith = vi.fn();
function renderView(over: Partial<React.ComponentProps<typeof PlayersView>> = {}) {
  return render(
    <MemoryRouter>
      <PlayersView
        rows={rows}
        visibleRows={rows}
        grouping={grouping()}
        search=""
        otherFilters={false}
        onGroupWith={onGroupWith}
        onResetFilters={vi.fn()}
        {...over}
      />
    </MemoryRouter>
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const menuOf = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: `More actions for ${name}` }));
};

beforeEach(() => {
  edit.mockReset().mockResolvedValue({});
  onGroupWith.mockReset();
});

describe('PlayersView', () => {
  it('lists Players folded, with counts, and loose members as plain rows', () => {
    renderView();
    const kestrel = rowOf('Kestrel Vane');
    expect(within(kestrel).getByText('3 characters · 1 outside corp')).toBeInTheDocument();
    expect(within(kestrel).getByText('· 1 not signed in')).toBeInTheDocument();
    expect(screen.queryByText('Vane Hauler')).not.toBeInTheDocument();
    expect(rowOf('Lena Voss')).toBeInTheDocument();
  });

  it('expands a Player on row click; outside characters read No data with chips', async () => {
    renderView();
    await userEvent.click(rowOf('Kestrel Vane'));
    expect(screen.getByText('Vane Hauler')).toBeInTheDocument();
    const outside = rowOf('Outer Rim Vane');
    expect(within(outside).getAllByText('No data').length).toBeGreaterThan(0);
    expect(within(outside).queryByText('Never')).not.toBeInTheDocument();
    expect(within(outside).getByText('Outside corp')).toBeInTheDocument();
    expect(within(outside).getByText('Not signed in yet')).toBeInTheDocument();
    await userEvent.click(rowOf('Kestrel Vane'));
    expect(screen.queryByText('Vane Hauler')).not.toBeInTheDocument();
  });

  it('opens a matching Player itself while a search is on', () => {
    renderView({ search: 'hauler', visibleRows: [rows[1]] });
    expect(screen.getByText('Vane Hauler')).toBeInTheDocument();
    expect(screen.queryByText('Lena Voss')).not.toBeInTheDocument();
  });

  it('Player menu: Add character… and Change main…', async () => {
    renderView();
    await menuOf('Kestrel Vane');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add character…' }));
    await waitFor(() => expect(onGroupWith).toHaveBeenCalledWith(1));
    await menuOf('Kestrel Vane');
    expect(await screen.findByRole('menuitem', { name: 'Change main…' })).toBeInTheDocument();
  });

  it('Change main saves a setMiner with the same characters', async () => {
    renderView();
    await menuOf('Kestrel Vane');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change main…' }));
    // Outside characters are not offered while the Player has a corp member.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Outer Rim Vane')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vane Hauler' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change main' }));
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith({
        action: 'setMiner',
        minerId: 'solo:1',
        characterIds: [1, 2, 4],
        mainCharacterId: 2,
      })
    );
  });

  it('alt menu: Make main edits the group; Remove asks first, then unlinks', async () => {
    renderView();
    await userEvent.click(rowOf('Kestrel Vane'));
    await menuOf('Vane Hauler');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make main' }));
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith({
        action: 'setMiner',
        minerId: 'solo:1',
        characterIds: [1, 2, 4],
        mainCharacterId: 2,
      })
    );

    await menuOf('Vane Hauler');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Player' }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent('sticks');
    expect(confirm).toHaveTextContent('will not add it back');
    expect(edit).toHaveBeenCalledTimes(1);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(edit).toHaveBeenLastCalledWith({
        action: 'unlink',
        minerId: 'solo:1',
        characterId: 2,
      })
    );
  });

  it('Make main is inert, with its reason, for an outside character while a corp member is in the group', async () => {
    renderView();
    await userEvent.click(rowOf('Kestrel Vane'));
    await menuOf('Outer Rim Vane');
    const item = await screen.findByRole('menuitem', { name: /Make main/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Outside the corp — a corp member stays main');
    await userEvent.click(item);
    expect(edit).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Remove from Player' })).toBeInTheDocument();
  });

  it('every character row menu carries Show info: Player, alt, outside character and loose member', async () => {
    renderView();
    await menuOf('Lena Voss');
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await menuOf('Kestrel Vane');
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(rowOf('Kestrel Vane'));
    await menuOf('Vane Hauler');
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await menuOf('Outer Rim Vane');
    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('a loose member keeps Group with…', async () => {
    renderView();
    await menuOf('Lena Voss');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Group with…' }));
    expect(onGroupWith).toHaveBeenCalledWith(10);
  });
});
