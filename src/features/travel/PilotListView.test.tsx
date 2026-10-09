import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { KillSpace } from '@/engine/pilotList/killActivity';
import { summarizeKills } from '@/engine/pilotList/killActivity';
import type { PilotListRow } from './pilotListData';

const mocks = vi.hoisted(() => ({
  loadPilotList: vi.fn(),
  syncConfigured: true,
  here: { space: 'highsec' as KillSpace | null },
}));
vi.mock('./pilotListData', () => ({
  loadPilotList: mocks.loadPilotList,
  loadViewerContext: () => Promise.resolve({}),
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => mocks.syncConfigured }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map([[24698, 'Drake']])),
}));
vi.mock('@/features/route/useSolarSystems', () => ({
  useSolarSystems: () => null,
  useSystemName: () => 'Uedama',
}));
vi.mock('./useHereSpace', () => ({
  useHereSpace: () => ({
    current: { systemId: 30002768, source: 'game', pick: vi.fn(), clearPick: vi.fn() },
    space: mocks.here.space,
  }),
}));

import { DscanShareControl, PilotListView } from './PilotListView';

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
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.here.space = 'highsec';
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

  it('washes a Dangerous row red and fills its badge, and dims an Inactive one', async () => {
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
    expect(rowOf('Sleeper')?.className).toContain('opacity-70');
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
    expect(cells[5].textContent).toBe('Drake');
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
