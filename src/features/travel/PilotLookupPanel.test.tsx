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
  fetchPilotKillmails: vi.fn(),
  fetchPilotKillHistory: vi.fn(),
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
vi.mock('@/lib/zkillboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zkillboard')>()),
  fetchPilotStats: mocks.fetchPilotStats,
  fetchPilotKillmails: mocks.fetchPilotKillmails,
  fetchPilotKillHistory: mocks.fetchPilotKillHistory,
}));
vi.mock('./pilotKillmailFit', () => ({ loadKillmailFit: mocks.loadKillmailFit }));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: mocks.loadTypes,
  loadGroupCategories: async () => ({}),
}));
vi.mock('@/engine/fitting/fittingShare', () => ({ encodeFittingShare: mocks.encodeFittingShare }));
vi.mock('./pilotLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pilotLookup')>()),
  resolvePilotByName: mocks.resolvePilotByName,
  loadPilotProfile: mocks.loadPilotProfile,
}));

// A pasted Local list's zKillboard lookups stay pending: these tests are about the strip and the box.
vi.mock('./pilotListData', () => ({
  loadPilotList: () => new Promise(() => undefined),
  loadViewerContext: () =>
    Promise.resolve({ contacts: new Map(), corporationId: null, allianceId: null }),
}));
vi.mock('./useHereSpace', () => ({
  useHereSpace: () => ({
    current: { systemId: null, source: null, pick: () => undefined, clearPick: () => undefined },
    space: null,
  }),
}));

import { PilotLookupPanel } from './PilotLookupPanel';

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

function renderTab(url = '/pilot-lookup') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PilotLookupPanel />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('PilotLookupPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.granted = false;
    mocks.loadTypeNames.mockResolvedValue(new Map([[19724, 'Kronos']]));
    mocks.loadPilotProfile.mockResolvedValue(PROFILE);
    mocks.fetchPilotStats.mockResolvedValue(STATS);
    mocks.fetchPilotKillmails.mockResolvedValue({ ok: true, entries: [] });
    mocks.fetchPilotKillHistory.mockResolvedValue({ ok: true, kills: [] });
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
    expect(await screen.findByText('1,043 kills')).toBeTruthy();
    expect(screen.queryByText('99.2%')).toBeNull();
    expect(screen.getByRole('meter', { name: 'Danger' })).toHaveAttribute('aria-valuenow', '68');
    expect(await screen.findByText('Kronos')).toBeTruthy();
    expect(screen.getByText('317')).toBeTruthy();
  });

  it('shows a Threat badge beside the name once the kills and the danger ratio are in', async () => {
    const day = 86_400_000;
    mocks.fetchPilotKillHistory.mockResolvedValue({
      ok: true,
      kills: Array.from({ length: 12 }, (_, i) => ({
        timeMs: Date.now() - (i + 1) * day,
        space: 'nullsec',
        systemId: 1,
        victimShipTypeId: i < 4 ? 670 : 587,
        ownShipTypeId: 20,
      })),
    });
    mocks.resolvePilotByName.mockResolvedValue({ characterId: 42, name: 'Some Pilot' });
    renderTab();
    fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
      target: { value: 'some pilot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    const heading = await screen.findByRole('heading', { name: 'Some Pilot' });
    // "Dangerous" is also the danger meter's high end: the badge is the one in the name row.
    expect(await within(heading.parentElement as HTMLElement).findByText('Dangerous')).toBeTruthy();
    expect(screen.getByText(/12 kills in the last 90 days/)).toBeTruthy();
    expect(screen.getByText('Nullsec hunter')).toBeTruthy();
    expect(screen.getByText(/33% of kills are pods/)).toBeTruthy();
  });

  it('shows no verdict band when the kill history could not be read', async () => {
    mocks.fetchPilotKillHistory.mockResolvedValue({ ok: false });
    mocks.resolvePilotByName.mockResolvedValue({ characterId: 42, name: 'Some Pilot' });
    renderTab();
    fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
      target: { value: 'some pilot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('1,043 kills')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Threat' })).toBeNull();
    // The meters and the ships they fly come from the stats, so they still show.
    expect(screen.getByRole('meter', { name: 'Kills vs losses' })).toBeTruthy();
    expect(screen.getByText('Kronos')).toBeTruthy();
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

  it('tells an empty page that a Local list or D-Scan can be pasted', () => {
    renderTab();
    expect(screen.getByText(/paste a Local list or a D-Scan/i)).toBeTruthy();
  });

  it('keeps the search box beside the list strip, so one pilot needs no Clear first', async () => {
    mocks.resolvePilotByName.mockResolvedValue({ characterId: 42, name: 'Some Pilot' });
    renderTab();
    fireEvent.paste(screen.getByRole('combobox', { name: 'Pilot' }), {
      clipboardData: {
        getData: () => ['Alpha One', 'Beta Two', 'Gamma Three'].join(String.fromCharCode(10)),
      },
    });
    expect(await screen.findByText('3 names, Local list')).toBeTruthy();
    const box = screen.getByRole('combobox', { name: 'Pilot' });

    fireEvent.change(box, { target: { value: 'some pilot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(screen.queryByText('3 names, Local list')).toBeNull();
    expect(probe.search).toBe('?pilot=42');
  });

  describe('a name box with one name per line', () => {
    const NL = String.fromCharCode(10);

    it('looks one name up on Enter, as it always did', async () => {
      mocks.resolvePilotByName.mockResolvedValue({ characterId: 42, name: 'Some Pilot' });
      renderTab();
      const box = screen.getByRole('combobox', { name: 'Pilot' });
      fireEvent.change(box, { target: { value: 'some pilot' } });
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    });

    it('keeps Enter for a new line once there is a list, and Ctrl+Enter looks it up', async () => {
      renderTab();
      const box = screen.getByRole('combobox', { name: 'Pilot' });
      fireEvent.change(box, { target: { value: 'Alpha One' + NL + 'Beta Two' } });

      expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(true);
      expect(screen.queryByText('2 names, Local list')).toBeNull();
      expect(mocks.resolvePilotByName).not.toHaveBeenCalled();

      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
      expect(await screen.findByText('2 names, Local list')).toBeTruthy();
    });

    it('looks a typed list up with the Look up button too', async () => {
      renderTab();
      fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
        target: { value: 'Alpha One' + NL + 'Beta Two' + NL + 'Gamma Three' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
      expect(await screen.findByText('3 names, Local list')).toBeTruthy();
    });

    it('says so when a line does not look like a pilot name', async () => {
      renderTab();
      fireEvent.change(screen.getByRole('combobox', { name: 'Pilot' }), {
        target: { value: 'Alpha One' + NL + 'not <a> name!' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
      expect(
        await screen.findByText(/One of the lines doesn't look like a pilot name/)
      ).toBeTruthy();
      expect(screen.queryByText('2 names, Local list')).toBeNull();
    });

    it('suggests for the line being typed and fills only that line', async () => {
      mocks.granted = true;
      mocks.searchMailRecipients.mockResolvedValue([{ characterId: 7, name: 'Nimjia' }]);
      renderTab();
      const box = screen.getByRole('combobox', { name: 'Pilot' }) as HTMLTextAreaElement;
      fireEvent.focus(box);
      const text = 'Zakof' + NL + 'Nim';
      box.setSelectionRange(text.length, text.length);
      fireEvent.change(box, { target: { value: text, selectionStart: text.length } });

      const option = await screen.findByRole('option', { name: 'Nimjia' }, { timeout: 2000 });
      expect(mocks.searchMailRecipients).toHaveBeenCalledWith(1, 'Nim', expect.any(AbortSignal));
      fireEvent.mouseDown(option);
      expect(box.value).toBe('Zakof' + NL + 'Nimjia');
      // Picking one name of a list does not open that pilot.
      expect(probe.search).toBe('');
    });
  });

  it('puts Copy Share Link beside Clear for a D-Scan, and nothing of the kind for a Local list', async () => {
    renderTab();
    const box = screen.getByRole('combobox', { name: 'Pilot' });
    const lines = ['626', '587', '626', '587'].map((id) => id + String.fromCharCode(9) + 'X');
    fireEvent.paste(box, {
      clipboardData: { getData: () => lines.join(String.fromCharCode(10)) },
    });
    expect(await screen.findByText('4 lines, D-Scan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Share Link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.paste(screen.getByRole('combobox', { name: 'Pilot' }), {
      clipboardData: { getData: () => ['Alpha One', 'Beta Two'].join(String.fromCharCode(10)) },
    });
    expect(await screen.findByText('2 names, Local list')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy Share Link' })).toBeNull();
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
    renderTab('/pilot-lookup?pilot=42');
    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(mocks.loadPilotProfile).toHaveBeenCalledWith(42);
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Some Pilot');
    expect(screen.getByText('-2.3')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^zKillboard/ }).getAttribute('href')).toBe(
      'https://zkillboard.com/character/42/'
    );
    // The profile is already on the page; the modal would only repeat it.
    expect(screen.queryByRole('button', { name: 'Public Info' })).toBeNull();
    // Corp and alliance are real Show Info links (§6c), not modal-opening buttons.
    expect(screen.getByRole('link', { name: 'Some Corp' }).getAttribute('href')).toContain(
      'info=corporation-200'
    );
    expect(screen.getByRole('link', { name: 'Some Alliance' }).getAttribute('href')).toContain(
      'info=alliance-300'
    );
  });

  it('shows the unknown-pilot state when ESI has no such character', async () => {
    mocks.loadPilotProfile.mockResolvedValue(null);
    renderTab('/pilot-lookup?pilot=9');
    expect(await screen.findByText("This pilot couldn't be found")).toBeTruthy();
  });

  it('shows an ESI outage apart from an unknown pilot', async () => {
    mocks.loadPilotProfile.mockRejectedValue(new Error('offline'));
    renderTab('/pilot-lookup?pilot=42');
    expect(await screen.findByText("EVE couldn't be reached")).toBeTruthy();
    expect(screen.queryByText("This pilot couldn't be found")).toBeNull();
  });

  it('retries the profile after an outage, and shows its age once loaded', async () => {
    mocks.loadPilotProfile.mockRejectedValueOnce(new Error('offline'));
    renderTab('/pilot-lookup?pilot=42');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.loadPilotProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector('time')).not.toBeNull());
  });

  it('retries zKillboard stats after a failure', async () => {
    mocks.fetchPilotStats.mockResolvedValueOnce({ kind: 'failed' });
    renderTab('/pilot-lookup?pilot=42');
    await screen.findByText("zKillboard couldn't be reached");
    const calls = mocks.fetchPilotStats.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.fetchPilotStats.mock.calls.length).toBe(calls + 1));
  });

  it('shows no history apart from a failure', async () => {
    mocks.fetchPilotStats.mockResolvedValue({ kind: 'no-history' });
    renderTab('/pilot-lookup?pilot=42');
    expect(await screen.findByText('No kills or losses on zKillboard')).toBeTruthy();
    expect(screen.queryByText("zKillboard couldn't be reached")).toBeNull();
  });

  it('shows a zKillboard failure apart from no history', async () => {
    mocks.fetchPilotStats.mockResolvedValue({ kind: 'failed' });
    renderTab('/pilot-lookup?pilot=42');
    expect(await screen.findByText("zKillboard couldn't be reached")).toBeTruthy();
    expect(screen.queryByText('No kills or losses on zKillboard')).toBeNull();
  });

  // The Threat verdict (decision 20261008-181210) says how threatening a pilot
  // looks and nothing more: no copy calls a pilot safe, hostile or one to avoid.
  // The one place "safe" appears is the help text's "never means safe".
  it('never calls a pilot safe, hostile or to be avoided (decision 20261008-181210)', () => {
    const { help, ...rest } = en.travel.pilot.threat;
    const copy = JSON.stringify({ ...en.travel.pilot, threat: rest }).toLowerCase();
    for (const word of ['safe', 'hostile', 'avoid']) {
      expect(copy).not.toContain(word);
    }
    expect(help).toContain('never means safe');
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
      renderTab('/pilot-lookup?pilot=42');
      const list = await screen.findByRole('list', { name: 'Recent kills and losses' });
      expect(mocks.fetchPilotKillmails).toHaveBeenCalledWith(42);
      expect(await within(list).findByText('Victim Pilot')).toBeTruthy();
      expect(within(list).getByText('Jita')).toBeTruthy();
      expect(within(list).getByText('Vexor')).toBeTruthy();
      expect(within(list).getByText('Kill')).toBeTruthy();
      expect(within(list).getByText('Loss')).toBeTruthy();
      expect(within(list).getByText('12.5M')).toBeTruthy();
      expect(mocks.loadKillmailFit).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: /^More on zKillboard/ }).getAttribute('href')).toBe(
        'https://zkillboard.com/character/42/'
      );
    });

    it('says so when the list hit its cap', async () => {
      mocks.fetchPilotKillmails.mockResolvedValue({
        ok: true,
        entries: Array.from({ length: 25 }, (_, i) => ({ ...INLINE_KILL, killmailId: 900 + i })),
      });
      renderTab('/pilot-lookup?pilot=42');
      expect(await screen.findByText(/Showing the latest 25/)).toBeTruthy();
    });

    it('reads a hash-only row on expand, once, and opens its fit in Fittings', async () => {
      mocks.loadKillmailFit.mockResolvedValue(FIT);
      renderTab('/pilot-lookup?pilot=42');
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
      renderTab('/pilot-lookup?pilot=42');
      await screen.findByRole('list', { name: 'Recent kills and losses' });
      fireEvent.click(screen.getAllByRole('button', { expanded: false })[1]!);
      expect(await screen.findByText(/killmail couldn't be read/i)).toBeTruthy();
    });

    it('shows a zKillboard failure apart from an empty list', async () => {
      mocks.fetchPilotKillmails.mockResolvedValue({ ok: false });
      renderTab('/pilot-lookup?pilot=42');
      expect(await screen.findByText("Recent kills and losses couldn't be loaded")).toBeTruthy();
    });
  });
});
