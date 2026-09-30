import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
}));
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

const probe = { search: '' };
function LocationProbe() {
  const { search } = useLocation();
  useEffect(() => {
    probe.search = search;
  }, [search]);
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
    expect(screen.getByText('1,043')).toBeTruthy();
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

  it('deep-links a pilot from ?pilot= and links to Public Info and zKillboard', async () => {
    renderTab('/travel/pilot?pilot=42');
    expect(await screen.findByRole('heading', { name: 'Some Pilot' })).toBeTruthy();
    expect(mocks.loadPilotProfile).toHaveBeenCalledWith(42);
    expect(screen.getByRole('link', { name: 'zKillboard' }).getAttribute('href')).toBe(
      'https://zkillboard.com/character/42/'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Public Info' }));
    expect(mocks.openPublicInfoModal).toHaveBeenCalledWith('character', 42);
    fireEvent.click(screen.getByRole('button', { name: 'Some Corp' }));
    expect(mocks.openPublicInfoModal).toHaveBeenCalledWith('corporation', 200);
  });

  it('shows the unknown-pilot state when ESI has no such character', async () => {
    mocks.loadPilotProfile.mockResolvedValue(null);
    renderTab('/travel/pilot?pilot=9');
    expect(await screen.findByText("This pilot couldn't be found")).toBeTruthy();
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
});
