import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { NpcStandingsReference } from '@/features/character/npcStandingsRows';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { useContactsStandings } from './ContactsStandings';

const loadMock = vi.hoisted(() => vi.fn());
const openNpcInfoMock = vi.hoisted(() => vi.fn());
const referenceMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/character/standings', () => ({ loadCharacterStandingsResult: loadMock }));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn(
    async () =>
      new Map([
        [500001, 'Caldari Navy'],
        [1000035, 'Caldari Navy Corp'],
        [3009001, 'Hanna Kurosawa'],
      ])
  ),
}));
vi.mock('@/features/character/npcStandingsReference', () => ({
  loadNpcStandingsReference: referenceMock,
}));
vi.mock('@/features/standings/openNpcInfo', () => ({ openNpcInfo: openNpcInfoMock }));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => false }));

const ENTRY = { from_id: 500001, from_type: 'faction', standing: 3.5 };
const CORP = { from_id: 1000035, from_type: 'npc_corp', standing: 5 };
const AGENT = { from_id: 3009001, from_type: 'agent', standing: 1 };
const MANY = {
  entries: [ENTRY, CORP, AGENT],
  fetchedAt: new Date(),
  fromCache: false,
  available: true,
};

const REFERENCE: NpcStandingsReference = {
  skills: { connections: 0, criminalConnections: 0, diplomacy: 0 },
  corporations: {
    factions: new Map([
      [1000035, 500001],
      [1000127, 500001],
    ]),
    corporationName: (id) =>
      ({ 1000035: 'Caldari Navy Corp', 1000127: 'Ishukone Corporation' })[id],
    factionName: (id) => (id === 500001 ? 'Caldari State' : undefined),
  },
  agents: {
    agentById: (id) =>
      id === 3009001
        ? {
            id,
            name: 'Hanna Kurosawa',
            level: 3,
            divisionId: 24,
            corporationId: 1000127,
            stationId: 1,
            isLocator: false,
          }
        : undefined,
    divisionName: () => 'Security',
  },
  stations: [
    {
      id: 60000001,
      name: 'Navy HQ',
      systemId: 30000142,
      ownerCorporationId: 1000035,
      ownerFactionId: 500001,
    },
    {
      id: 1,
      name: 'Agent station',
      systemId: 30000144,
      ownerCorporationId: 1000127,
      ownerFactionId: 500001,
    },
  ],
  jumps: new Map([
    [30000142, 3],
    [30000144, 0],
  ]),
};

/** Shows the query string, so a test can read what the filters wrote to the URL. */
function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

/** The page's header, as `Contacts` lays it out around the hook's parts. */
function StandingsHarness({ characterId }: { characterId: number }) {
  const { meta, actions, content } = useContactsStandings(characterId, true);
  return (
    <>
      <div>{meta}</div>
      <div>{actions}</div>
      <div>tab strip</div>
      {content}
    </>
  );
}

function renderTab(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <StandingsHarness characterId={91} />
      <SearchProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadMock.mockReset();
  openNpcInfoMock.mockReset();
  referenceMock.mockReset().mockResolvedValue(REFERENCE);
});

describe('ContactsStandings header', () => {
  it('shows the data-age chip and a Refresh button once standings load', async () => {
    loadMock.mockResolvedValue({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();

    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByText(/just now|ago/i)).toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith(91, { force: false });
  });

  it('Refresh forces a live fetch and re-renders the rows', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();
    await screen.findByText('Caldari Navy');

    loadMock.mockResolvedValueOnce({
      entries: [{ ...ENTRY, standing: -2 }],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(loadMock).toHaveBeenLastCalledWith(91, { force: true }));
    expect(await screen.findAllByText('-2.00')).not.toHaveLength(0);
  });

  it('has no chip when there is no data', async () => {
    loadMock.mockResolvedValue({ entries: [], fetchedAt: null, fromCache: false, available: true });
    renderTab();

    expect(await screen.findByText('No standings yet')).toBeInTheDocument();
    expect(screen.queryByText(/just now|ago/i)).toBeNull();
  });

  it('says it could not load, not "No NPC standings yet", when nothing was loaded', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [],
      fetchedAt: null,
      fromCache: false,
      available: false,
    });
    renderTab();

    expect(await screen.findAllByText("Couldn't load")).not.toHaveLength(0);
    expect(screen.queryByText('No standings yet')).toBeNull();

    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
  });

  it('labels rows served from cache', async () => {
    loadMock.mockResolvedValue({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: true,
      available: true,
    });
    renderTab();

    expect(await screen.findByText('Caldari Navy')).toBeInTheDocument();
    expect(screen.getByText('Showing cached data')).toBeInTheDocument();
  });

  it('keeps the rows on screen while Refresh is in flight', async () => {
    loadMock.mockResolvedValueOnce({
      entries: [ENTRY],
      fetchedAt: new Date(),
      fromCache: false,
      available: true,
    });
    renderTab();
    await screen.findByText('Caldari Navy');

    let finish: (value: unknown) => void = () => {};
    loadMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled());
    expect(screen.getByText('Caldari Navy')).toBeInTheDocument();
    finish({ entries: [ENTRY], fetchedAt: new Date(), fromCache: true, available: true });
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
  });
});

describe('ContactsStandings table', () => {
  beforeEach(() => loadMock.mockResolvedValue(MANY));

  it('lists what each row belongs to, what its chain opens, and who is open now', async () => {
    renderTab();
    await screen.findByText('Hanna Kurosawa');

    const table = screen.getByRole('table', { name: 'Standings' });
    for (const header of ['Name', 'Type', 'Belongs to', 'Standing', 'Access', 'Jumps', 'Fees']) {
      expect(
        within(table).getByRole('columnheader', { name: new RegExp(`^${header}`) })
      ).toBeVisible();
    }
    // Base is ESI's number, which only broker fees read: off until asked for.
    expect(within(table).queryByRole('columnheader', { name: /^Base/ })).toBeNull();
    const agent = within(table).getByText('Hanna Kurosawa').closest('tr') as HTMLElement;
    expect(within(agent).getByText('Agent')).toBeInTheDocument();
    expect(within(agent).getByText(/Ishukone Corporation/)).toBeInTheDocument();
    expect(within(agent).getByText(/L3 Security/)).toBeInTheDocument();
    // the faction's 3.5 is the best standing in the chain: level 3 is open
    expect(within(agent).getByText('Open')).toBeInTheDocument();

    const corp = within(table).getByText('Caldari Navy Corp').closest('tr') as HTMLElement;
    expect(within(corp).getByText('Corporation')).toBeInTheDocument();
    expect(within(corp).getByText('Caldari State')).toBeInTheDocument();
    expect(within(corp).getByText('Agents up to level 4')).toBeInTheDocument();
    expect(within(corp).getByText('Broker fee')).toBeInTheDocument();
  });

  it('says what a closed agent needs', async () => {
    loadMock.mockResolvedValue({ ...MANY, entries: [{ ...AGENT, standing: 0 }] });
    renderTab();
    await screen.findByText('Hanna Kurosawa');
    expect(screen.getByText('Needs 3.00')).toBeInTheDocument();
  });

  it("shows Base in place of Standing, and no Access, when the pilot's skills are unknown", async () => {
    referenceMock.mockResolvedValue({ ...REFERENCE, skills: null });
    renderTab();
    const corp = (await screen.findByText('Caldari Navy Corp')).closest('tr') as HTMLElement;
    const table = screen.getByRole('table', { name: 'Standings' });
    expect(within(table).queryByRole('columnheader', { name: /^Standing/ })).toBeNull();
    expect(within(table).getByRole('columnheader', { name: /^Base/ })).toBeVisible();
    expect(within(corp).getByText('5.00')).toBeInTheDocument();
    // Access: a base-standing answer would understate what the skills lift.
    expect(within(corp).getAllByText('—')).toHaveLength(1);
  });

  it('links the jumps to the nearest station, an agent to its own, and plainly says 0 jumps when already there', async () => {
    renderTab();
    const table = await screen.findByRole('table', { name: 'Standings' });
    const corp = within(table).getByText('Caldari Navy Corp').closest('tr') as HTMLElement;
    const link = within(corp).getByRole('link', { name: '3 jumps' });
    expect(link.getAttribute('href')).toContain('/travel/route');
    expect(link.getAttribute('href')).toContain('30000142');
    const agent = within(table).getByText('Hanna Kurosawa').closest('tr') as HTMLElement;
    expect(within(agent).getByText('0 jumps')).toBeInTheDocument();
    expect(within(agent).queryByRole('link', { name: /jump/ })).toBeNull();
  });

  it('leaves the jumps empty when the distances are unknown', async () => {
    referenceMock.mockResolvedValue({ ...REFERENCE, jumps: null });
    renderTab();
    const table = await screen.findByRole('table', { name: 'Standings' });
    expect(within(table).queryByRole('link', { name: /jump/ })).toBeNull();
    expect(within(table).queryByText(/jumps?$/)).toBeNull();
  });

  it('offers Base from the Columns menu', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Hanna Kurosawa');
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Base' }));
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('columnheader', { name: /^Base/ })).toBeVisible();
  });

  it('leaves an agent the agents data does not know with no belongs to and no access', async () => {
    loadMock.mockResolvedValue({
      ...MANY,
      entries: [{ from_id: 3009777, from_type: 'agent', standing: 6 }],
    });
    renderTab();
    const row = (await screen.findByText('#3009777')).closest('tr') as HTMLElement;
    expect(within(row).queryByText('Open')).toBeNull();
    expect(within(row).queryByText(/Agents up to level/)).toBeNull();
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });

  it("opens the row's info when its name is clicked", async () => {
    renderTab();
    fireEvent.click(await screen.findByText('Caldari Navy Corp'));
    expect(openNpcInfoMock).toHaveBeenLastCalledWith('corporation', 1000035);
    fireEvent.click(screen.getByText('Hanna Kurosawa'));
    expect(openNpcInfoMock).toHaveBeenLastCalledWith('agent', 3009001);
    fireEvent.click(screen.getByText('Caldari Navy'));
    expect(openNpcInfoMock).toHaveBeenLastCalledWith('faction', 500001);
  });

  it("opens the row's info from the keyboard", async () => {
    const user = userEvent.setup();
    renderTab();
    const name = await screen.findByText('Hanna Kurosawa');
    ((name.closest('tr') ?? name) as HTMLElement).focus();
    await user.keyboard('{Enter}');
    expect(openNpcInfoMock).toHaveBeenCalledWith('agent', 3009001);
  });

  describe('filters', () => {
    it('narrows by type from the URL', async () => {
      renderTab('/?standings.type=agent');
      await screen.findByText('Hanna Kurosawa');
      expect(screen.queryByText('Caldari Navy Corp')).toBeNull();
      expect(screen.queryByText('Caldari Navy')).toBeNull();
    });

    it('narrows by type from the Type menu, with a count per type, and writes it to the URL', async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findByText('Hanna Kurosawa');
      await user.click(screen.getByRole('button', { name: /^Type: / }));
      expect(await screen.findByRole('menuitemcheckbox', { name: 'Agent (1)' })).toBeChecked();
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Faction (1)' }));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Corporation (1)' }));

      await waitFor(() => expect(screen.queryByText('Caldari Navy Corp')).toBeNull());
      expect(screen.getByText('Hanna Kurosawa')).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('standings.type=agent');
    });

    it('keeps agents of at least the chosen level from the URL', async () => {
      // the corporation's 5.0 opens level 4; the faction's 3.5 and the agent's chain (best 3.5) only level 3
      renderTab('/?standings.access=4');
      await screen.findByText('Caldari Navy Corp');
      expect(screen.queryByText('Hanna Kurosawa')).toBeNull();
      expect(screen.queryByText('Caldari Navy')).toBeNull();
    });

    it('keeps the fee owners with the Used for fees chip, and writes it to the URL', async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findByText('Hanna Kurosawa');
      await user.click(screen.getByRole('button', { name: 'Used for fees' }));
      await waitFor(() => expect(screen.queryByText('Hanna Kurosawa')).toBeNull());
      expect(screen.getByText('Caldari Navy Corp')).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('standings.fees=1');
    });

    it('searches what a row belongs to', async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findByText('Hanna Kurosawa');
      await user.type(screen.getByRole('searchbox', { name: 'Name' }), 'security');
      await waitFor(() => expect(screen.queryByText('Caldari Navy Corp')).toBeNull());
      expect(screen.getByText('Hanna Kurosawa')).toBeInTheDocument();
    });

    it('says when the filters match nothing', async () => {
      renderTab('/?standings.type=');
      expect(await screen.findByText('No contacts match the selected filters')).toBeInTheDocument();
    });
  });

  it('hides a column from the Columns menu', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Hanna Kurosawa');
    expect(screen.getByRole('columnheader', { name: /^Belongs to/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Belongs to' }));
    // An open menu hides the page from the accessibility tree.
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: /^Belongs to/ })).toBeNull()
    );
    expect(screen.getByRole('columnheader', { name: /^Standing/ })).toBeVisible();
  });

  describe('on a phone', () => {
    const realMatchMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = (media: string) =>
        ({
          media,
          matches: media === NARROW_QUERY,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
    });
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    it('puts the filters behind a funnel that counts the active ones', async () => {
      renderTab('/?standings.fees=1&standings.access=3');
      await screen.findByText('Caldari Navy Corp');
      expect(screen.queryByRole('button', { name: /^Type: / })).toBeNull();
      expect(screen.getByRole('button', { name: 'Filters (2 active)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
    });
  });
});
