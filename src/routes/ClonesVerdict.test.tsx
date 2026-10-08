import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useClonesSort } from '@/features/character/clonesSort';
import { App } from '@/app/App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => [
    {
      typeID: 3300,
      name: 'Gunnery Test',
      description: '',
      groupID: 255,
      groupName: 'Gunnery',
      rank: 1,
      primaryAttr: 'intelligence',
      secondaryAttr: 'memory',
      prereqs: [],
    },
  ]),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 92;
const ESI = 'https://esi.evetech.net';
const STATION = 60003760;
const STRUCTURE = 1000000000002;
const IMPLANT_INT5 = 19540;
const IMPLANT_PLAIN = 19541;

interface Scenario {
  worn: number[];
  jumpImplants: number[][];
  queue: () => unknown[];
  implantsStatus: number;
  /** Reported intelligence: the 20 base plus whatever the worn implant adds. */
  intelligence: number;
}

const liveQueue = () => [
  {
    skill_id: 3300,
    queue_position: 0,
    finished_level: 5,
    start_date: new Date(Date.now() - 3_600_000).toISOString(),
    finish_date: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    level_start_sp: 0,
    level_end_sp: 200_000,
    training_start_sp: 0,
  },
];

let scenario: Scenario;

function clonesBody() {
  return {
    home_location: { location_id: STATION, location_type: 'station' },
    jump_clones: [
      {
        jump_clone_id: 1,
        location_id: STATION,
        location_type: 'station',
        implants: scenario.jumpImplants[0],
      },
      {
        jump_clone_id: 2,
        location_id: STRUCTURE,
        location_type: 'structure',
        implants: scenario.jumpImplants[1] ?? [],
      },
    ],
    // Off cooldown: the verdict compares against an immediate jump.
    last_clone_jump_date: '2020-01-01T00:00:00Z',
  };
}

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json(clonesBody())),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: 30000142 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/implants`, () =>
    scenario.implantsStatus === 200
      ? HttpResponse.json(scenario.worn)
      : HttpResponse.json({ error: 'forbidden' }, { status: scenario.implantsStatus })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/attributes`, () =>
    HttpResponse.json({
      intelligence: scenario.intelligence,
      memory: 20,
      perception: 20,
      willpower: 19,
      charisma: 20,
    })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json(scenario.queue())),
  http.get(`${ESI}/universe/systems/30000142`, () =>
    HttpResponse.json({ system_id: 30000142, name: 'Jita', security_status: 0.9459 })
  ),
  http.get('https://market.fuzzwork.co.uk/aggregates/', ({ request }) => {
    const types = new URL(request.url).searchParams.get('types')?.split(',') ?? [];
    const body: Record<string, unknown> = {};
    for (const id of types) {
      body[id] =
        id === String(IMPLANT_INT5) || id === String(IMPLANT_PLAIN)
          ? {
              sell: {
                min: id === String(IMPLANT_INT5) ? '9000000' : '50000000',
                volume: '1',
                orderCount: '1',
              },
            }
          : { sell: { orderCount: '0' } };
    }
    return HttpResponse.json(body);
  }),
  http.get(`${ESI}/universe/stations/${STATION}`, () =>
    HttpResponse.json({
      station_id: STATION,
      name: 'Jita IV - Moon 4',
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  http.get(`${ESI}/universe/structures/${STRUCTURE}`, () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}`, () =>
    HttpResponse.json({
      name: 'Pilot Two',
      corporation_id: 1001,
      birthday: '2015-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'female',
      race_id: 1,
    })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/corporationhistory`, () => HttpResponse.json([])),
  http.get(`${ESI}/corporations/1001`, () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get(`${ESI}/universe/types/${IMPLANT_INT5}`, () =>
    HttpResponse.json({
      type_id: IMPLANT_INT5,
      name: 'Intelligence Plus Five',
      description: '',
      group_id: 300,
      published: true,
      dogma_attributes: [{ attribute_id: 176, value: 5 }],
    })
  ),
  http.get(`${ESI}/universe/types/${IMPLANT_PLAIN}`, () =>
    HttpResponse.json({
      type_id: IMPLANT_PLAIN,
      name: 'Plain Implant',
      description: '',
      group_id: 300,
      published: true,
      dogma_attributes: [],
    })
  ),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: IMPLANT_INT5, name: 'Intelligence Plus Five', category: 'inventory_type' },
      { id: IMPLANT_PLAIN, name: 'Plain Implant', category: 'inventory_type' },
    ])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  scenario = {
    worn: [IMPLANT_PLAIN],
    jumpImplants: [[IMPLANT_INT5], []],
    queue: liveQueue,
    implantsStatus: 200,
    intelligence: 20,
  };
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useClonesSort.setState({ value: 'training', hydrated: false });
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot Two', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [
      'esi-clones.read_clones.v1',
      'esi-clones.read_implants.v1',
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1',
    ],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/clones');
});

const verdict = () => screen.findByRole('region', { name: 'Training verdict' });
/** The card first shows a note while routes resolve, so wait for the real heading. */
const verdictCard = async (heading: string) => {
  const card = await verdict();
  await within(card).findByText(heading);
  return card;
};

describe('Clones training verdict', () => {
  it('says a jump is worth it, with the saving, the reason and a route link', async () => {
    render(<App />);
    const card = await verdictCard('Worth a jump');
    expect(within(card).getByText(/finishes your queue .* sooner/)).toBeInTheDocument();
    expect(within(card).getByText(/trains on Intelligence/)).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: /^Route to Jita IV - Moon 4 · 0 jumps$/ })
    ).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /^Stay in this clone/ })).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /^Best alternative/ })).toBeInTheDocument();
    // The queue is one link, not a skill-by-skill legend.
    expect(within(card).getByRole('link', { name: 'View queue' })).toHaveAttribute(
      'href',
      '/overview'
    );
    expect(within(card).queryByText(/^Queue: /)).not.toBeInTheDocument();
    // The winning clone carries the badge, with its time and delta.
    expect(await screen.findAllByText('Best for training')).toHaveLength(2); // sort tab + badge
    expect(screen.getAllByText(/sooner/).length).toBeGreaterThan(1);
  });

  it('says stay put when the worn clone is already the fastest', async () => {
    scenario.worn = [IMPLANT_INT5];
    scenario.intelligence = 25;
    scenario.jumpImplants = [[IMPLANT_PLAIN], []];
    render(<App />);
    const card = await verdictCard('Stay put');
    expect(
      within(card).getByText('You are already in your fastest clone for this queue')
    ).toBeInTheDocument();
    expect(within(card).getByText(/closest alternative/i)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /^Route to/ })).not.toBeInTheDocument();
  });

  it('shows no verdict for an empty queue', async () => {
    scenario.queue = () => [];
    render(<App />);
    expect(await screen.findByText(/training queue is empty/)).toBeInTheDocument();
    expect(screen.queryByText('Worth a jump')).not.toBeInTheDocument();
    expect(screen.queryByText('Stay put')).not.toBeInTheDocument();
  });

  it('shows no verdict for a paused queue', async () => {
    scenario.queue = () => [{ skill_id: 3300, queue_position: 0, finished_level: 5 }];
    render(<App />);
    expect(await screen.findByText(/training queue is paused/)).toBeInTheDocument();
    expect(screen.queryByText('Worth a jump')).not.toBeInTheDocument();
  });

  it('shows no verdict without the implants grant, and the list still works', async () => {
    scenario.implantsStatus = 403;
    render(<App />);
    expect(await screen.findByText(/worn implants could not be read/)).toBeInTheDocument();
    expect(screen.queryByText('Worth a jump')).not.toBeInTheDocument();
    expect(screen.queryByText('Stay put')).not.toBeInTheDocument();
    expect((await screen.findAllByText('Jita IV - Moon 4')).length).toBeGreaterThan(0);
  });

  it('sorts the list and remembers the choice on the device', async () => {
    // Clone 1: fast and near but cheap. Clone 2: slow, valuable, route unknown.
    scenario.jumpImplants = [[IMPLANT_INT5], [IMPLANT_PLAIN]];
    render(<App />);
    await verdictCard('Worth a jump');
    const group = screen.getByRole('group', { name: 'Sort clones' });
    expect(within(group).getByRole('button', { name: 'Best for training' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const order = () =>
      Array.from(screen.getByRole('list', { name: 'Clones' }).querySelectorAll(':scope > li'))
        .slice(1) // "Wearing now" stays pinned first
        .map((li) => (/Intelligence Plus Five/.test(li.textContent ?? '') ? 'fast' : 'valuable'));
    expect(order()).toEqual(['fast', 'valuable']);
    fireEvent.click(within(group).getByRole('button', { name: 'Value' }));
    await waitFor(() => expect(order()).toEqual(['valuable', 'fast']));
    await waitFor(async () => expect((await db.settings.get('clonesSort'))?.value).toBe('value'));
    fireEvent.click(within(group).getByRole('button', { name: 'Nearest' }));
    await waitFor(() => expect(order()).toEqual(['fast', 'valuable']));
  });
});
