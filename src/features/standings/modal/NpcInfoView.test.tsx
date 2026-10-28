import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildAgentIndex } from '@/sde/agents';
import { buildNpcCorporationIndex } from '@/sde/npcCorporations';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { useActiveCharacter } from '@/stores/activeCharacter';
import NpcInfoView from './NpcInfoView';

const mocks = vi.hoisted(() => ({
  standings: vi.fn(),
  skills: vi.fn(),
  corporationFactions: vi.fn(),
  npcCorporations: vi.fn(),
  agents: vi.fn(),
  stations: vi.fn(),
  lpCorporations: vi.fn(),
  factions: vi.fn(),
  jumps: vi.fn(),
  nearest: vi.fn(),
  loyalty: vi.fn(),
  system: vi.fn(),
}));
vi.mock('@/features/character/standings', () => ({
  loadCharacterStandingsResult: mocks.standings,
}));
vi.mock('../standingSkills', () => ({ loadStandingSkills: mocks.skills }));
vi.mock('../corporationFactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../corporationFactions')>()),
  loadCorporationFactions: mocks.corporationFactions,
}));
vi.mock('@/sde/npcCorporations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/npcCorporations')>()),
  loadNpcCorporations: mocks.npcCorporations,
}));
vi.mock('@/sde/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/agents')>()),
  loadAgents: mocks.agents,
}));
vi.mock('@/sde/loadMarketSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadMarketSde')>()),
  loadNpcStations: mocks.stations,
  loadLpCorporations: mocks.lpCorporations,
}));
vi.mock('../factions', () => ({ loadFactions: mocks.factions }));
vi.mock('../stationJumps', () => ({ loadNearestStation: mocks.nearest }));
vi.mock('@/features/route/jumpsFromCurrent', () => ({ jumpsFromCurrent: mocks.jumps }));
vi.mock('@/features/character/loyalty', () => ({ loadCharacterLoyaltyPoints: mocks.loyalty }));
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem: mocks.system }));

const CALDARI = 500001;
const CALDARI_NAVY = 1000035;
const ISHUKONE = 1000125;
const HANNA = 3009001;
const MIKA = 3009002;
const JITA = 30000142;
const PERIMETER = 30000144;
const HASATEEM = 30000200;

const STATIONS: NpcStationEntry[] = [
  {
    id: 60003760,
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemId: JITA,
    ownerCorporationId: CALDARI_NAVY,
    ownerFactionId: CALDARI,
  },
  {
    id: 60000010,
    name: 'Perimeter - Caldari Navy Logistic Support',
    systemId: PERIMETER,
    ownerCorporationId: CALDARI_NAVY,
    ownerFactionId: CALDARI,
  },
  {
    id: 60000020,
    name: 'Hasateem - Ishukone Corporation Factory',
    systemId: HASATEEM,
    ownerCorporationId: ISHUKONE,
    ownerFactionId: CALDARI,
  },
];

const STANDINGS = {
  available: true,
  fromCache: false,
  fetchedAt: new Date(),
  entries: [
    { from_id: CALDARI, from_type: 'faction', standing: 5 },
    { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: 6 },
    { from_id: ISHUKONE, from_type: 'npc_corp', standing: 2 },
    { from_id: HANNA, from_type: 'agent', standing: 7.65 },
    { from_id: MIKA, from_type: 'agent', standing: 1 },
  ],
};

function renderView(kind: 'faction' | 'corporation' | 'agent', id: number) {
  render(
    <MemoryRouter>
      <NpcInfoView kind={kind} id={id} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
  mocks.standings.mockReset().mockResolvedValue(STANDINGS);
  mocks.skills.mockReset().mockResolvedValue({
    social: { connections: 0, criminalConnections: 0, diplomacy: 0 },
    brokerRelationsLevel: 4,
  });
  mocks.corporationFactions.mockReset().mockResolvedValue(
    new Map([
      [CALDARI_NAVY, CALDARI],
      [ISHUKONE, CALDARI],
    ])
  );
  mocks.npcCorporations.mockReset().mockResolvedValue(
    buildNpcCorporationIndex({
      factions: [{ id: CALDARI, name: 'Caldari State' }],
      corporations: [
        {
          id: CALDARI_NAVY,
          name: 'Caldari Navy',
          ticker: 'CN',
          factionId: CALDARI,
          hqStationId: 60003760,
        },
        {
          id: ISHUKONE,
          name: 'Ishukone Corporation',
          ticker: 'ISH',
          factionId: CALDARI,
          hqStationId: 60000001,
        },
        { id: 1000180, name: 'State Protectorate', ticker: 'SP', factionId: CALDARI },
      ],
    })
  );
  mocks.agents.mockReset().mockResolvedValue(
    buildAgentIndex({
      divisions: { 22: 'Security' },
      agents: [
        [HANNA, 'Hanna Kurosawa', 3, 22, ISHUKONE, 60000020, 0],
        [MIKA, 'Mika Hosokawa', 2, 22, ISHUKONE, 60000020, 0],
      ],
    } as never)
  );
  mocks.stations.mockReset().mockResolvedValue(STATIONS);
  mocks.lpCorporations.mockReset().mockResolvedValue([{ id: CALDARI_NAVY, name: 'Caldari Navy' }]);
  mocks.factions.mockReset().mockResolvedValue([
    {
      faction_id: CALDARI,
      name: 'Caldari State',
      description: 'A state.',
      militia_corporation_id: 1000180,
      size_factor: 5,
      solar_system_id: 30000145,
      station_count: 412,
      station_system_count: 118,
      is_unique: true,
    },
  ]);
  mocks.jumps.mockReset().mockResolvedValue(new Map([[HASATEEM, 6]]));
  mocks.nearest.mockReset().mockResolvedValue({
    stationId: 60000010,
    stationName: 'Perimeter - Caldari Navy Logistic Support',
    systemId: PERIMETER,
    jumps: 1,
  });
  mocks.loyalty.mockReset().mockResolvedValue({
    cached: { data: [{ corporation_id: CALDARI_NAVY, loyalty_points: 12400 }] },
    needsReauth: false,
  });
  mocks.system.mockReset().mockResolvedValue({ id: 30000145, name: 'Caldari Prime' });
});

describe('NpcInfoView, a corporation', () => {
  it('shows the standing chain: effective numbers, the highest bold, one sentence', async () => {
    renderView('corporation', CALDARI_NAVY);
    const standing = await screen.findByRole('heading', { name: 'Your standing' });
    const card = standing.closest('section')!;
    const rows = within(card).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('5.00Caldari StateFaction');
    expect(rows[1]).toHaveTextContent('6.00Caldari NavyCorporation');
    expect(within(rows[1]!).getByText('Caldari Navy')).toHaveClass('font-semibold');
    expect(within(rows[0]!).getByText('Caldari State')).not.toHaveClass('font-semibold');
    expect(within(card).getByText('Agents use your highest: Caldari Navy.')).toBeInTheDocument();
  });

  it('says what the next agent level takes, with each level’s need and an accessible name per pip', async () => {
    renderView('corporation', CALDARI_NAVY);
    const heading = await screen.findByRole('heading', { name: 'Agent access' });
    const card = heading.closest('section')!;
    expect(within(card).getByRole('img', { name: 'Level 3 needs 3.00, open' })).toBeInTheDocument();
    expect(
      within(card).getByRole('img', { name: 'Level 5 needs 7.00, closed' })
    ).toBeInTheDocument();
    expect(within(card).getByText('Level 5 needs 7.00: 1.00 more.')).toBeInTheDocument();
  });

  it('puts broker fee and reprocessing tax each on one unwrapped line, with the savings', async () => {
    renderView('corporation', CALDARI_NAVY);
    const heading = await screen.findByRole('heading', { name: 'At their stations' });
    const card = heading.closest('section')!;
    const list = card.querySelector('dl')!;
    expect(list).toHaveClass('whitespace-nowrap');
    const rows = [...list.children];
    expect(rows).toHaveLength(2);
    // 3% - 0.3% * 4 = 1.80%; minus 0.03 * 5 + 0.02 * 6 = 1.53%.
    expect(rows[0]).toHaveTextContent('Broker fee at Jita 4-41.80% 1.53% saves 0.27%');
    expect(rows[0]!.querySelector('s')).toHaveTextContent('1.80%');
    // 5% * (1 - 0.15 * 6) = 0.5%.
    expect(rows[1]).toHaveTextContent('Reprocessing tax5.0% ~0.5% saves ~4.5%');
    expect(
      within(card).getByText('Broker fee uses your base standings and Broker Relations 4.')
    ).toBeInTheDocument();
  });

  it('lists the headquarters and the nearest station, whose jumps open Route Safety', async () => {
    renderView('corporation', CALDARI_NAVY);
    const heading = await screen.findByRole('heading', { name: 'Where' });
    const card = heading.closest('section')!;
    expect(
      within(card).getByRole('link', { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' })
    ).toBeInTheDocument();
    expect(within(card).getByText('2 in 2 systems')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '1 jump' })).toHaveAttribute(
      'href',
      routeToHref(PERIMETER, undefined, undefined, 60000010)
    );
  });

  it('lists the agents you know with a jumps link to each agent’s system', async () => {
    renderView('corporation', ISHUKONE);
    const heading = await screen.findByRole('heading', { name: 'Agents you know' });
    const card = heading.closest('section')!;
    const rows = within(card).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('7.65Hanna KurosawaL3 Security6 jumps');
    expect(rows[1]).toHaveTextContent('1.00Mika HosokawaL2 Security6 jumps');
    expect(within(rows[0]!).getByRole('link', { name: '6 jumps' })).toHaveAttribute(
      'href',
      routeToHref(HASATEEM)
    );
    expect(within(rows[0]!).getByRole('link', { name: 'Hanna Kurosawa' })).toHaveAttribute(
      'href',
      `/?info=character-${HANNA}`
    );
  });

  it('shows the loyalty points and a link to the LP store', async () => {
    renderView('corporation', CALDARI_NAVY);
    expect(await screen.findByText('12,400')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open LP store' })).toHaveAttribute(
      'href',
      `/wallet/lp-store/${CALDARI_NAVY}`
    );
  });

  it('omits a headquarters the station snapshot lacks, without failing', async () => {
    renderView('corporation', ISHUKONE);
    const heading = await screen.findByRole('heading', { name: 'Where' });
    expect(within(heading.closest('section')!).queryByText('Headquarters')).toBeNull();
    expect(within(heading.closest('section')!).getByText('1 in 1 system')).toBeInTheDocument();
  });

  it('says only that standings are unread when the standing cards fail, and keeps the facts', async () => {
    mocks.standings.mockRejectedValue(new Error('offline'));
    renderView('corporation', CALDARI_NAVY);
    expect(await screen.findByText("Your standing couldn't be read.")).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Where' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your standing' })).toBeNull();
  });

  it('shows the facts alone, and reads nothing about the pilot, when no Character is signed in', async () => {
    useActiveCharacter.setState({ activeCharacterId: null });
    renderView('corporation', CALDARI_NAVY);
    expect(await screen.findByRole('heading', { name: 'Where' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your standing' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'At their stations' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open LP store' })).toBeNull();
    expect(mocks.standings).not.toHaveBeenCalled();
    expect(mocks.nearest).not.toHaveBeenCalled();
  });

  it('with skills unknown shows the base figure without the skills tooltip or a broker row', async () => {
    mocks.skills.mockResolvedValue(null);
    renderView('corporation', CALDARI_NAVY);
    const heading = await screen.findByRole('heading', { name: 'At their stations' });
    expect(within(heading.closest('section')!).queryByText(/Broker fee/)).toBeNull();
    const standing = screen.getByRole('heading', { name: 'Your standing' }).closest('section')!;
    expect(standing.querySelector('[tabindex="0"][class*="dotted"]')).toBeNull();
  });
});

describe('NpcInfoView, a faction', () => {
  it('lists the corporations you know, the capital with its jumps and the militia', async () => {
    mocks.jumps.mockResolvedValue(new Map([[30000145, 4]]));
    renderView('faction', CALDARI);
    const known = (await screen.findByRole('heading', { name: 'Corporations you know' })).closest(
      'section'
    )!;
    const rows = within(known).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('6.00Caldari Navy');
    expect(rows[1]).toHaveTextContent('2.00Ishukone Corporation');
    const where = screen.getByRole('heading', { name: 'Where' }).closest('section')!;
    expect(within(where).getByText(/Caldari Prime/)).toBeInTheDocument();
    expect(within(where).getByRole('link', { name: '4 jumps' })).toHaveAttribute(
      'href',
      routeToHref(30000145)
    );
    expect(within(where).getByText('412 in 118 systems')).toBeInTheDocument();
    expect(within(where).getByRole('link', { name: 'State Protectorate' })).toBeInTheDocument();
  });

  it('quotes the broker fee and reprocessing tax at the Trade Hub the faction owns', async () => {
    renderView('faction', CALDARI);
    const card = (await screen.findByRole('heading', { name: 'At their stations' })).closest(
      'section'
    )!;
    expect(card).toHaveTextContent('Broker fee at Jita 4-4');
    expect(card).toHaveTextContent('Reprocessing tax at Jita 4-4');
  });
});

describe('NpcInfoView, an agent', () => {
  it('says whether you can use this agent and outlines its own level', async () => {
    renderView('agent', HANNA);
    const heading = await screen.findByRole('heading', { name: 'Can you use this agent?' });
    const card = heading.closest('section')!;
    expect(within(card).getByText('Yes. Level 3 needs 3.00; you have 7.65.')).toBeInTheDocument();
    const own = within(card).getByRole('img', { name: 'Level 3 needs 3.00, open' });
    expect(own.firstElementChild).toHaveClass('outline-2');
    expect(
      within(card).getByRole('img', { name: 'Level 4 needs 5.00, open' }).firstElementChild
    ).not.toHaveClass('outline-2');
  });

  it('chains faction, corporation and agent, and puts the agent’s station and division under Where', async () => {
    renderView('agent', HANNA);
    const chain = (await screen.findByRole('heading', { name: 'Your standing' })).closest(
      'section'
    )!;
    expect(within(chain).getAllByRole('listitem')).toHaveLength(3);
    expect(within(chain).getByText('Agents use your highest: Hanna Kurosawa.')).toBeInTheDocument();
    const where = screen.getByRole('heading', { name: 'Where' }).closest('section')!;
    expect(
      await within(where).findByRole('link', { name: 'Hasateem - Ishukone Corporation Factory' })
    ).toBeInTheDocument();
    expect(within(where).getByText('Level 3 Security')).toBeInTheDocument();
    expect(within(where).getByRole('link', { name: '6 jumps' })).toBeInTheDocument();
  });

  it('shows no standing cards for an agent the baked file does not hold', async () => {
    renderView('agent', 3999999);
    await vi.waitFor(() => expect(mocks.agents).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Your standing' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Can you use this agent?' })).toBeNull();
    expect(mocks.jumps).not.toHaveBeenCalled();
  });
});

describe('NpcInfoView, a vetoed chain', () => {
  it('says the -2.0 link blocks level 2+ agents, and closes those pips', async () => {
    mocks.standings.mockResolvedValue({
      ...STANDINGS,
      entries: [
        { from_id: CALDARI, from_type: 'faction', standing: 9 },
        { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: -2.5 },
      ],
    });
    renderView('corporation', CALDARI_NAVY);
    const standing = (await screen.findByRole('heading', { name: 'Your standing' })).closest(
      'section'
    )!;
    expect(
      within(standing).getByText(
        'Caldari Navy is at -2.50: at −2.0 or lower it blocks level 2+ agents.'
      )
    ).toBeInTheDocument();
    const access = screen.getByRole('heading', { name: 'Agent access' }).closest('section')!;
    expect(
      within(access).getByRole('img', { name: 'Level 2 needs 1.00, closed' })
    ).toBeInTheDocument();
    expect(
      within(access).getByText(
        'Only level 1 agents stay open while a standing is at −2.0 or lower.'
      )
    ).toBeInTheDocument();
  });
});
