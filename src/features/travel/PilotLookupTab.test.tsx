import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import en from '@/i18n/locales/en.json';

const mocks = vi.hoisted(() => ({
  granted: undefined as boolean | undefined,
  searchMailRecipients: vi.fn(),
  resolvePilotByName: vi.fn(),
  loadPilotProfile: vi.fn(),
  fetchPilotStats: vi.fn(),
  loadTypeNames: vi.fn(),
  openPublicInfoModal: vi.fn(),
  fetchPilotKillmails: vi.fn(),
  loadKillmailFit: vi.fn(),
  resolveNames: vi.fn(),
  loadTypes: vi.fn(),
  encodeFittingShare: vi.fn(),
}));

vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: () => mocks.granted }));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (state: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 1 }),
}));
vi.mock('@/features/character/mailRecipientSearch', () => ({
  MIN_RECIPIENT_SEARCH_LENGTH: 3,
  searchMailRecipients: mocks.searchMailRecipients,
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: mocks.loadTypeNames }));
vi.mock('@/stores/publicInfoModal', () => ({ openPublicInfoModal: mocks.openPublicInfoModal }));
vi.mock('@/lib/zkillboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zkillboard')>()),
  fetchPilotStats: mocks.fetchPilotStats,
  fetchPilotKillmails: mocks.fetchPilotKillmails,
}));
vi.mock('./pilotKillmailFit', () => ({ loadKillmailFit: mocks.loadKillmailFit }));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));
vi.mock('@/sde/loadSde', () => ({ loadTypes: mocks.loadTypes }));
vi.mock('@/engine/fitting/fittingShare', () => ({ encodeFittingShare: mocks.encodeFittingShare }));
vi.mock('./pilotLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pilotLookup')>()),
  resolvePilotByName: mocks.resolvePilotByName,
  loadPilotProfile: mocks.loadPilotProfile,
}));

import { PilotLookupTab } from './PilotLookupTab';

const PROFILE = {
  characterId: 42,
  name: 'Some Pilot',
  birthday: '2010-01-01T00:00:00Z',
  corporationId: 200,
  corporationName: 'Some Corp',
  allianceId: 300,
  allianceName: 'Some Alliance',
  securityStatus: -2.345,
};

const STATS = {
  kind: 'stats' as const,
  stats: {
    kills: 1043,
    losses: 181,
    iskDestroyed: 1_888_000_000_000,
    iskLost: 14_400_000_000,
    iskEfficiency: 0.9924,
    soloKills: 18,
    dangerRatio: 68,
    gangRatio: 99,
    topShips: [{ shipTypeId: 19724, kills: 317 }],
  },
};

const probe = { pathname: '', search: '' };
function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    probe.pathname = pathname;
    probe.search = search;
  }, [pathname, search]);
  return null;
}

function renderTab(url = '/travel/pilot') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PilotLookupTab tabBar={null} />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('PilotLookupTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.granted = false;
    mocks.loadTypeNames.mockResolvedValue(new Map([[19724, 'Kronos']]));
    mocks.loadPilotProfile.mockResolvedValue(PROFILE);
    mocks.fetchPilotStats.mockResolvedValue(STATS);
    mocks.fetchPilotKillmails.mockResolvedValue({ ok: true, entries: [] });
    mocks.resolveNames.mockResolvedValue(
      new Map([
        [900, 'Victim Pilot'],
        [901, 'Final Blower'],
        [30000142, 'Jita'],
      ])
    );
    mocks.loadTypes.mockResolvedValue({
      626: { name: 'Vexor' },
      587: { name: 'Rifter' },
      100: { name: 'Small Autocannon' },
    });
    mocks.encodeFittingShare.mockResolvedValue({ ok: true, payload: 'CODE' });
  });

  it('resolves an exact name without the search scope and shows the stats card', async () => {
    mocks.resolvePilotByName.mockResolvedValue({ characterId: 42, name: 'Some Pilot' });
    renderTab();
    fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
      target: { value: 'some pilot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(mocks.resolvePilotByName).toHaveBeenCalledWith('some pilot');
    expect(mocks.searchMailRecipients).not.toHaveBeenCalled();
    expect(probe.search).toBe('?pilot=42');
    expect(await screen.findByText('1,043')).toBeTruthy();
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('68%')).toBeTruthy();
    expect(await screen.findByText('Kronos')).toBeTruthy();
    expect(screen.getByText('317 kills')).toBeTruthy();
  });

  it('suggests matches with the search scope and selects one', async () => {
    mocks.granted = true;
    mocks.searchMailRecipients.mockResolvedValue([{ characterId: 42, name: 'Some Pilot' }]);
    renderTab();
    const input = screen.getByRole('combobox', { name: 'Pilot' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'some' } });

    const option = await screen.findByRole('option', { name: 'Some Pilot' }, { timeout: 2000 });
    expect(mocks.searchMailRecipients).toHaveBeenCalledWith(1, 'some', expect.any(AbortSignal));
    fireEvent.mouseDown(option);
    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(probe.search).toBe('?pilot=42');
  });

  it('says so when no pilot has the name', async () => {
    mocks.resolvePilotByName.mockResolvedValue(null);
    renderTab();
    fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
      target: { value: 'Nobody Here' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText(/No pilot is named “Nobody Here”/)).toBeTruthy();
    expect(mocks.loadPilotProfile).not.toHaveBeenCalled();
  });

  it('deep-links a pilot from ?pilot= and links to zKillboard', async () => {
    renderTab('/travel/pilot?pilot=42');
    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(mocks.loadPilotProfile).toHaveBeenCalledWith(42);
    expect(screen.getByText('-2.3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'zKillboard' }).getAttribute('href')).toBe(
      'https://zkillboard.com/character/42/'
    );
    // The profile is already on the page; the modal would only repeat it.
    expect(screen.queryByRole('button', { name: 'Public Info' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Some Corp' }));
    expect(mocks.openPublicInfoModal).toHaveBeenCalledWith('corporation', 200);
  });

  it('shows the unknown-pilot state when ESI has no such character', async () => {
    mocks.loadPilotProfile.mockResolvedValue(null);
    renderTab('/travel/pilot?pilot=9');
    expect(await screen.findByText("This pilot couldn't be found")).toBeTruthy();
  });

  it('shows an ESI outage apart from an unknown pilot', async () => {
    mocks.loadPilotProfile.mockRejectedValue(new Error('offline'));
    renderTab('/travel/pilot?pilot=42');
    expect(await screen.findByText("EVE couldn't be reached")).toBeTruthy();
    expect(screen.queryByText("This pilot couldn't be found")).toBeNull();
  });

  it('shows no history apart from a failure', async () => {
    mocks.fetchPilotStats.mockResolvedValue({ kind: 'no-history' });
    renderTab('/travel/pilot?pilot=42');
    expect(await screen.findByText('No kills or losses on zKillboard')).toBeTruthy();
    expect(screen.queryByText("zKillboard couldn't be reached")).toBeNull();
  });

  it('shows a zKillboard failure apart from no history', async () => {
    mocks.fetchPilotStats.mockResolvedValue({ kind: 'failed' });
    renderTab('/travel/pilot?pilot=42');
    expect(await screen.findByText("zKillboard couldn't be reached")).toBeTruthy();
    expect(screen.queryByText('No kills or losses on zKillboard')).toBeNull();
  });

  it('states numbers, never a verdict, in its copy (decision 20260912-172628)', () => {
    const copy = JSON.stringify(en.travel.pilot).toLowerCase();
    for (const word of ['safe', 'hostile', 'threat', 'avoid', 'dangerous']) {
      expect(copy).not.toContain(word);
    }
  });

  describe('recent kills and losses', () => {
    const INLINE_KILL = {
      killmailId: 20,
      hash: 'aa',
      side: 'kill' as const,
      value: 12_500_000,
      detail: {
        time: '2026-09-01T12:00:00Z',
        systemId: 30000142,
        victim: { ship_type_id: 626, items: [] },
        victimParty: { characterId: 900, corporationId: 901, shipTypeId: 626 },
        finalBlow: { characterId: 42, corporationId: 200, shipTypeId: 11 },
      },
    };
    const HASH_ONLY_LOSS = {
      killmailId: 10,
      hash: 'bb',
      side: 'loss' as const,
      value: 3_000_000,
      detail: null,
    };
    const FIT = {
      ok: true as const,
      detail: {
        time: '2026-08-30T08:00:00Z',
        systemId: 30000142,
        victim: { ship_type_id: 587, items: [] },
        victimParty: { characterId: 42, corporationId: 200, shipTypeId: 587 },
        finalBlow: { characterId: 901, corporationId: 902, shipTypeId: 626 },
      },
      fitting: {
        name: 'Rifter',
        shipTypeId: 587,
        modules: [{ slot: 'high' as const, slotIndex: 0, typeId: 100, state: 'active' as const }],
        drones: [],
        cargo: [],
      },
    };

    beforeEach(() => {
      mocks.fetchPilotKillmails.mockResolvedValue({
        ok: true,
        entries: [INLINE_KILL, HASH_ONLY_LOSS],
      });
    });

    it('lists kills and losses without reading any killmail', async () => {
      renderTab('/travel/pilot?pilot=42');
      const list = await screen.findByRole('list', { name: 'Recent kills and losses' });
      expect(mocks.fetchPilotKillmails).toHaveBeenCalledWith(42);
      expect(await within(list).findByText('Victim Pilot')).toBeTruthy();
      expect(within(list).getByText('Jita')).toBeTruthy();
      expect(within(list).getByText('Vexor')).toBeTruthy();
      expect(within(list).getByText('Kill')).toBeTruthy();
      expect(within(list).getByText('Loss')).toBeTruthy();
      expect(within(list).getByText('12.5M')).toBeTruthy();
      expect(mocks.loadKillmailFit).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'More on zKillboard' }).getAttribute('href')).toBe(
        'https://zkillboard.com/character/42/'
      );
    });

    it('reads a hash-only row on expand, once, and opens its fit in Fittings', async () => {
      mocks.loadKillmailFit.mockResolvedValue(FIT);
      renderTab('/travel/pilot?pilot=42');
      await screen.findByRole('list', { name: 'Recent kills and losses' });
      const [, lossRow] = screen.getAllByRole('button', { expanded: false });
      fireEvent.click(lossRow!);

      expect(await screen.findByText('High slots')).toBeTruthy();
      expect(screen.getByText('Small Autocannon')).toBeTruthy();
      expect(mocks.loadKillmailFit).toHaveBeenCalledWith(HASH_ONLY_LOSS);
      // The row fills in from the killmail it read: the final blow, not "—".
      expect(await screen.findByText('Final Blower')).toBeTruthy();

      fireEvent.click(lossRow!);
      fireEvent.click(lossRow!);
      await screen.findByText('High slots');
      expect(mocks.loadKillmailFit).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Open in Fittings' }));
      await waitFor(() => expect(probe.pathname).toBe('/ships/fittings/edit'));
      expect(probe.search).toBe('?f=CODE');
    });

    it('says so when a killmail cannot be read', async () => {
      mocks.loadKillmailFit.mockResolvedValue({ ok: false });
      renderTab('/travel/pilot?pilot=42');
      await screen.findByRole('list', { name: 'Recent kills and losses' });
      fireEvent.click(screen.getAllByRole('button', { expanded: false })[1]!);
      expect(await screen.findByText(/killmail couldn't be read/i)).toBeTruthy();
    });

    it('shows a zKillboard failure apart from an empty list', async () => {
      mocks.fetchPilotKillmails.mockResolvedValue({ ok: false });
      renderTab('/travel/pilot?pilot=42');
      expect(await screen.findByText("Recent kills and losses couldn't be loaded")).toBeTruthy();
    });
  });
});
