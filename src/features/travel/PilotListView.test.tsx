import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { KillSpace } from '@/engine/pilotList/killActivity';
import { summarizeKills } from '@/engine/pilotList/killActivity';
import type { PilotListRow } from './pilotListData';

const mocks = vi.hoisted(() => ({
  loadPilotList: vi.fn(),
  syncConfigured: true,
  here: { space: 'highsec' as KillSpace | null },
  phone: false,
}));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => mocks.phone }));
vi.mock('./pilotListData', () => ({
  loadPilotList: mocks.loadPilotList,
  loadViewerContext: () => Promise.resolve({}),
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => mocks.syncConfigured }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map([[24698, 'Drake']])),
}));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSolarSystemList: () => ({ systems: null, failed: false, retry: () => {} }),
  useSystemName: () => 'Uedama',
}));
// The board is FleetBoard's own to test; here only what the live paste hands it.
vi.mock('./FleetBoard', () => ({
  FleetBoard: ({ wormholeSpace }: { wormholeSpace?: boolean }) => (
    <p>{wormholeSpace ? 'wormhole board' : 'k-space board'}</p>
  ),
}));
vi.mock('./useHereSpace', () => ({
  useHereSpace: () => ({
    current: { systemId: 30002768, source: 'game', pick: vi.fn(), clearPick: vi.fn() },
    space: mocks.here.space,
  }),
}));

import { DscanShareControl, PilotListView } from './PilotListView';
import { LOCAL_GROUP_MODE_KEY, useLocalGroupMode } from './localGroupMode';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function kill(agoMs: number, space: KillSpace) {
  return {
    timeMs: Date.now() - agoMs,
    space,
    systemId: 1,
    victimShipTypeId: 2,
    ownShipTypeId: 24698,
  };
}

function row(name: string, over: Partial<PilotListRow> = {}): PilotListRow {
  return {
    name,
    characterId: name.length,
    notFound: false,
    corporationId: null,
    allianceId: null,
    corporationName: `${name} Corp`,
    allianceName: null,
    standing: null,
    ownOrganization: null,
    kills: { kind: 'skipped' },
    extras: { kind: 'idle' },
    ...over,
  };
}

function ready(...kills: ReturnType<typeof kill>[]): PilotListRow['kills'] {
  return { kind: 'ready', kills, summary: summarizeKills(kills, Date.now()) };
}

const ROWS: PilotListRow[] = [
  row('Gankerton', { kills: ready(kill(26 * HOUR, 'highsec'), kill(30 * HOUR, 'highsec')) }),
  row('Nullbear', { kills: ready(kill(2 * HOUR, 'nullsec'), kill(3 * DAY, 'nullsec')) }),
  row('Sleeper', { kills: ready(kill(90 * DAY, 'lowsec')) }),
  row('Suspect', {
    standing: { band: 'orange', value: -5, via: 'corporation' },
    kills: ready(kill(5 * DAY, 'lowsec')),
  }),
  row('Corpmate', { ownOrganization: 'corporation' }),
  row('Ally', { standing: { band: 'blue', value: 10, via: 'alliance' } }),
  row('Ghost', { characterId: null, notFound: true }),
  row('Offline', { kills: { kind: 'unreachable' } }),
];

function renderList(overflow = 0) {
  return render(
    <MemoryRouter>
      <PilotListView paste={{ kind: 'local', names: ROWS.map((r) => r.name), overflow }} />
    </MemoryRouter>
  );
}

describe('PilotListView (Local list)', () => {
  beforeEach(async () => {
    await db.settings.clear();
    vi.resetAllMocks();
    mocks.here.space = 'highsec';
    mocks.phone = false;
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(ROWS);
        return Promise.resolve();
      }
    );
  });

  const headings = () =>
    screen.getAllByRole('heading', { level: 3 }).map((h) => h.firstChild?.textContent);

  it('puts a Threat badge beside each looked-up pilot, and none where there is nothing to read', async () => {
    renderList();
    await screen.findByRole('table', { name: 'Killed in highsec, last 30 days' });
    const badgeOf = (name: string) =>
      screen.getByText(name).closest('td')?.querySelector('span.inline-flex')?.textContent;
    expect(badgeOf('Nullbear')).toContain('Low threat');
    expect(badgeOf('Sleeper')).toContain('Inactive');
    expect(badgeOf('Offline') ?? null).toBeNull();
  });

  it('washes a Dangerous row red and fills its badge, and leaves an Inactive one plain', async () => {
    const killedLately = Array.from({ length: 10 }, (_, i) => kill((i + 1) * HOUR, 'highsec'));
    const rows = [
      row('Reaper', {
        kills: ready(...killedLately),
        extras: { kind: 'ready', dangerRatio: 80, killerRatio: 80, lossTimesMs: null },
      }),
      row('Sleeper', { kills: ready(kill(100 * DAY, 'lowsec')) }),
    ];
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(rows);
        return Promise.resolve();
      }
    );
    renderList();
    await screen.findByText('Reaper');
    const rowOf = (name: string) => screen.getByText(name).closest('tr');
    expect(rowOf('Reaper')?.className).toContain('border-l-danger!');
    expect(screen.getByText('Dangerous').closest('span.inline-flex')?.className).toContain(
      'bg-danger!'
    );
    expect(rowOf('Sleeper')?.className).not.toContain('border-l-danger!');
  });

  it('draws each pilot as a card on a phone: badge, big kill count and kills by space', async () => {
    mocks.phone = true;
    renderList();
    const list = await screen.findByRole('list', { name: 'Killed in highsec, last 30 days' });
    expect(screen.queryByRole('table')).toBeNull();
    const card = within(list).getByText('Gankerton').closest('li');
    expect(card).not.toBeNull();
    const inCard = within(card as HTMLElement);
    expect(inCard.getAllByText('2').length).toBeGreaterThan(0);
    expect(inCard.getByText('Kills, 30 days')).toBeTruthy();
    expect(inCard.getByText('Highsec')).toBeTruthy();
    expect(inCard.getByText('Low threat')).toBeTruthy();
  });

  it('groups pilots by what they mean to you, in a fixed order', async () => {
    renderList();
    await screen.findByRole('table', { name: 'Killed in highsec, last 30 days' });
    expect(headings()).toEqual([
      'Red and orange contacts',
      'Killed in highsec, last 30 days',
      'Killed elsewhere, last 30 days',
      'No kills in 30 days',
      'Not checked yet',
      'Friendly',
    ]);
  });

  it('puts the pilot who killed in your space under that group', async () => {
    renderList();
    const here = await screen.findByRole('table', { name: 'Killed in highsec, last 30 days' });
    expect(within(here).getByText('Gankerton')).toBeTruthy();
    const elsewhere = screen.getByRole('table', { name: 'Killed elsewhere, last 30 days' });
    expect(within(elsewhere).getByText('Nullbear')).toBeTruthy();
    // Lowsec-only kills 90 days ago is quiet, not "elsewhere".
    const quiet = screen.getByRole('table', { name: 'No kills in 30 days' });
    expect(within(quiet).getByText('Sleeper')).toBeTruthy();
  });

  it('gives every group table the same Standing and kill-count column widths', async () => {
    renderList();
    await screen.findByRole('table', { name: 'Killed in highsec, last 30 days' });
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThan(1);
    const widthsOf = (table: HTMLElement) =>
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.className.split(/\s+/).find((c) => /^w-\d+$/.test(c)) ?? null);
    for (const table of tables) {
      // Fixed layout, so the pinned widths hold whatever the group's content.
      expect(table.className).toContain('table-fixed');
      // Pilot and Flew on stay flexible; Standing, Highsec, Lowsec, Nullsec are pinned.
      expect(widthsOf(table)).toEqual(widthsOf(tables[0]));
      expect(widthsOf(table).filter((w) => w !== null)).toHaveLength(4);
    }
  });

  it('regroups when the space you are in changes', async () => {
    mocks.here.space = 'nullsec';
    renderList();
    const here = await screen.findByRole('table', { name: 'Killed in nullsec, last 30 days' });
    expect(within(here).getByText('Nullbear')).toBeTruthy();
    const elsewhere = screen.getByRole('table', { name: 'Killed elsewhere, last 30 days' });
    expect(within(elsewhere).getByText('Gankerton')).toBeTruthy();
  });

  it('shows kills per space with how long ago the latest was', async () => {
    renderList();
    const elsewhere = await screen.findByRole('table', { name: 'Killed elsewhere, last 30 days' });
    const cells = within(within(elsewhere).getAllByRole('row')[1]).getAllByRole('cell');
    // Pilot, Your standing, Highsec, Lowsec, Nullsec, Flew on kills.
    expect(cells[4].textContent).toBe('22h ago');
    expect(cells[2].textContent).toBe('0—');
    // The ship name resolves after the table first paints.
    await waitFor(() =>
      expect(within(elsewhere).getAllByRole('row')[1]).toHaveTextContent('Drake')
    );
  });

  it('shows the contact standing and where it came from', async () => {
    renderList();
    const hostile = await screen.findByRole('table', { name: 'Red and orange contacts' });
    // The Contacts page's own standing icon, naming whose contact it is.
    expect(within(hostile).getByRole('img', { name: /standing \(-5\).*their corp/ })).toBeTruthy();
    expect(within(hostile).getByText('their corporation')).toBeTruthy();
  });

  it('keeps your corporation, alliance and blue contacts folded away until asked', async () => {
    renderList();
    await screen.findByRole('table', { name: 'Killed in highsec, last 30 days' });
    expect(screen.queryByText('Corpmate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const friendly = screen.getByRole('table', { name: 'Friendly' });
    expect(within(friendly).getByText('Corpmate')).toBeTruthy();
    expect(within(friendly).getByText('Your corporation')).toBeTruthy();
    expect(within(friendly).getByRole('img', { name: /standing \(10\)/ })).toBeTruthy();
  });

  it('links each name to the Show Info dialog, not another page', async () => {
    renderList();
    const link = await screen.findByRole('link', { name: 'Gankerton' });
    expect(link.getAttribute('href')).toContain('info=character-9');
  });

  it('says which names were not found and how many were cut off', async () => {
    renderList(12);
    expect(await screen.findByText(/1 name not found: Ghost/)).toBeTruthy();
    expect(screen.getByText(/12 more not looked up/)).toBeTruthy();
  });

  it('names the system it reads from, and lets you change it', async () => {
    renderList();
    expect(await screen.findByRole('button', { name: /Change your system/ })).toBeTruthy();
    expect(screen.getByText('Last API system')).toBeTruthy();
  });
});

describe('PilotListView (D-Scan)', () => {
  const dscan = { kind: 'dscan' as const, typeIds: [], rows: [], text: '' };

  it('tells the board when the Current System is wormhole space', () => {
    mocks.here.space = 'wormhole';
    render(<PilotListView paste={dscan} />);
    expect(screen.getByText('wormhole board')).toBeTruthy();
  });

  it('tells the board k-space, or an unknown system, is not', () => {
    mocks.here.space = 'lowsec';
    const first = render(<PilotListView paste={dscan} />);
    expect(screen.getByText('k-space board')).toBeTruthy();
    first.unmount();
    mocks.here.space = null;
    render(<PilotListView paste={dscan} />);
    expect(screen.getByText('k-space board')).toBeTruthy();
  });
});

describe('DscanShareControl', () => {
  const scan = (text: string) => ({ kind: 'dscan' as const, typeIds: [626], rows: [], text });
  const TAB = String.fromCharCode(9);
  const NL = String.fromCharCode(10);
  const SCAN = ['626', '587', '626', '587']
    .map((id) => [id, 'X', 'Ship', '1 km'].join(TAB))
    .join(NL);
  const share = () => screen.getByRole('button', { name: 'Copy Share Link' });

  beforeEach(() => {
    mocks.syncConfigured = true;
  });

  it('is a labelled button, enabled for a signed-in character', () => {
    render(<DscanShareControl paste={scan(SCAN)} characterId={1} />);
    expect(share()).toBeEnabled();
  });

  it('is disabled without a character', () => {
    render(<DscanShareControl paste={scan(SCAN)} characterId={null} />);
    expect(share()).toBeDisabled();
  });

  it('is disabled when the scan is too large to share', () => {
    render(<DscanShareControl paste={scan(SCAN + NL + 'x'.repeat(60_000))} characterId={1} />);
    expect(share()).toBeDisabled();
  });
});

describe('PilotListView (new since last paste)', () => {
  const PREVIOUS = ['Ann', 'Bob', 'Cat', 'Dan'];

  beforeEach(async () => {
    await db.settings.clear();
    vi.resetAllMocks();
    mocks.here.space = 'highsec';
    mocks.phone = false;
    mocks.loadPilotList.mockImplementation(
      (names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(names.map((name) => row(name)));
        return Promise.resolve();
      }
    );
  });

  function paste(names: string[]) {
    return render(
      <MemoryRouter>
        <PilotListView paste={{ kind: 'local', names, overflow: 0 }} />
      </MemoryRouter>
    );
  }

  it('shows no marker and no count on the first paste ever', async () => {
    paste(PREVIOUS);
    await screen.findByText('Ann');
    await waitFor(async () =>
      expect((await db.settings.get('local.lastPaste'))?.value).toEqual(PREVIOUS)
    );
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.queryByText(/new since last paste/)).toBeNull();
  });

  it('marks only the added pilots and counts them when the same Local is pasted again', async () => {
    await db.settings.put({ key: 'local.lastPaste', value: PREVIOUS });
    paste([...PREVIOUS, 'Eve']);
    expect(await screen.findByText('1 new since last paste')).toBeTruthy();
    const tags = await screen.findAllByText('New');
    expect(tags).toHaveLength(1);
    expect(tags[0].parentElement?.textContent).toContain('Eve');
  });

  it('marks nothing when the paste shares too little with the last one', async () => {
    await db.settings.put({ key: 'local.lastPaste', value: PREVIOUS });
    paste(['Xan', 'Yul', 'Zed', 'Ann']);
    await screen.findByText('Xan');
    await waitFor(async () =>
      expect((await db.settings.get('local.lastPaste'))?.value).toEqual([
        'Xan',
        'Yul',
        'Zed',
        'Ann',
      ])
    );
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.queryByText(/new since last paste/)).toBeNull();
  });

  it('marks new pilots on the phone cards too', async () => {
    mocks.phone = true;
    await db.settings.put({ key: 'local.lastPaste', value: PREVIOUS });
    paste([...PREVIOUS, 'Eve']);
    expect(await screen.findByText('1 new since last paste')).toBeTruthy();
    expect(await screen.findAllByText('New')).toHaveLength(1);
  });
});

describe('PilotListView (Group by Organization, issue #5668)', () => {
  const lotus = { allianceId: 501, allianceName: 'Black Lotus' };
  const ORG_ROWS: PilotListRow[] = [
    row('Kael', {
      ...lotus,
      corporationId: 601,
      corporationName: 'Vanguard',
      kills: ready(kill(2 * HOUR, 'highsec')),
    }),
    row('Mira', {
      ...lotus,
      corporationId: 601,
      corporationName: 'Vanguard',
      kills: ready(kill(3 * HOUR, 'highsec')),
    }),
    row('Bram', { ...lotus, corporationId: 602, corporationName: 'Harbor', kills: ready() }),
    row('Wren', { corporationId: 701, corporationName: 'Ember', kills: ready() }),
    // Stands in for a name past the 40-name zKillboard cap.
    row('Imre', { corporationId: 701, corporationName: 'Ember', kills: { kind: 'notLookedUp' } }),
    row('Varek', { corporationId: 801, corporationName: 'Quiet Orbit', kills: ready() }),
    row('Corpmate', {
      corporationId: 901,
      corporationName: 'Home Corp',
      ownOrganization: 'corporation',
    }),
    row('Corpmate Two', {
      corporationId: 901,
      corporationName: 'Home Corp',
      ownOrganization: 'corporation',
    }),
  ];

  beforeEach(async () => {
    await db.settings.clear();
    useLocalGroupMode.setState({ value: 'kills', hydrated: false });
    vi.resetAllMocks();
    mocks.here.space = 'highsec';
    mocks.phone = false;
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(ORG_ROWS);
        return Promise.resolve();
      }
    );
  });

  function renderOrgList() {
    return render(
      <MemoryRouter>
        <PilotListView paste={{ kind: 'local', names: ORG_ROWS.map((r) => r.name), overflow: 0 }} />
      </MemoryRouter>
    );
  }

  it('groups by Kills by default, and switches to Organization, remembering the pick on this device', async () => {
    renderOrgList();
    const group = await screen.findByRole('group', { name: 'Group by' });
    expect(within(group).getByRole('button', { name: 'Kills' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(within(group).getByRole('button', { name: 'Organization' }));

    expect(await screen.findByRole('link', { name: 'Black Lotus' })).toBeInTheDocument();
    await waitFor(async () =>
      expect((await db.settings.get(LOCAL_GROUP_MODE_KEY))?.value).toBe('organization')
    );
  });

  it('heads an alliance with a group per corporation, a lone corporation by itself, and lone pilots apart', async () => {
    await db.settings.put({ key: LOCAL_GROUP_MODE_KEY, value: 'organization' });
    renderOrgList();

    const alliance = (await screen.findByRole('link', { name: 'Black Lotus' })).closest('h3');
    expect(alliance?.textContent).toContain('3 pilots');
    expect(screen.getByRole('table', { name: 'Vanguard' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Harbor' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Ember' })).toBeInTheDocument();
    const alone = screen.getByRole('table', { name: 'On their own' });
    expect(within(alone).getByText('Varek')).toBeInTheDocument();
    // Friendly stays last and folded, as in the Kills view.
    expect(screen.queryByText('Corpmate')).toBeNull();
  });

  it('groups the Friendly section by organization too, once it is opened', async () => {
    await db.settings.put({ key: LOCAL_GROUP_MODE_KEY, value: 'organization' });
    renderOrgList();
    await screen.findByRole('link', { name: 'Black Lotus' });
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const heading = screen.getByRole('link', { name: 'Home Corp' }).closest('h3');
    expect(heading?.textContent).toContain('2 pilots');
    expect(screen.getByRole('table', { name: 'Home Corp' })).toBeInTheDocument();
  });

  it("shows a corporation's contact on that corporation, never on its alliance's heading", async () => {
    const red = { band: 'red' as const, value: -10, via: 'corporation' as const };
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(ORG_ROWS.map((r) => (r.corporationId === 602 ? { ...r, standing: red } : r)));
        return Promise.resolve();
      }
    );
    await db.settings.put({ key: LOCAL_GROUP_MODE_KEY, value: 'organization' });
    renderOrgList();
    const alliance = (await screen.findByRole('link', { name: 'Black Lotus' })).closest('h3');
    expect(within(alliance as HTMLElement).queryByRole('img')).toBeNull();
    const harbor = screen.getByRole('link', { name: 'Harbor' }).closest('h4');
    expect(within(harbor as HTMLElement).getByRole('img')).toBeInTheDocument();
  });

  it('places a pilot past the zKillboard cap by organization, saying the kills were not looked up', async () => {
    await db.settings.put({ key: LOCAL_GROUP_MODE_KEY, value: 'organization' });
    renderOrgList();
    const ember = await screen.findByRole('table', { name: 'Ember' });
    const imre = within(ember).getByText('Imre').closest('tr');
    expect(imre?.textContent).toContain('Not looked up');
  });
});

describe('PilotListView (old kills)', () => {
  beforeEach(async () => {
    await db.settings.clear();
    useLocalGroupMode.setState({ value: 'kills', hydrated: false });
    vi.resetAllMocks();
    mocks.here.space = 'highsec';
    mocks.phone = false;
  });

  it('dates a kill up to six months old, and leaves an older one undated', async () => {
    const rows = [
      row('Recent', { kills: ready(kill(100 * DAY, 'lowsec')) }),
      row('Ancient', { kills: ready(kill(390 * DAY, 'nullsec')) }),
    ];
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(rows);
        return Promise.resolve();
      }
    );
    render(
      <MemoryRouter>
        <PilotListView paste={{ kind: 'local', names: rows.map((r) => r.name), overflow: 0 }} />
      </MemoryRouter>
    );
    const recent = (await screen.findByText('Recent')).closest('tr');
    const ancient = screen.getByText('Ancient').closest('tr');
    expect(recent?.textContent).toMatch(/\d+mo ago|\d+d ago/);
    expect(ancient?.textContent).not.toMatch(/ago/);
  });
});
