import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { StoredWar } from '@/engine/wars';
import { usePublicInfo } from '@/stores/publicInfo';
import { WarBanner } from './WarBanner';

const loadActiveWars = vi.fn<() => Promise<readonly StoredWar[]>>();
vi.mock('./activeWars', () => ({
  ACTIVE_WARS_POLL_MS: 3_600_000,
  loadActiveWars: () => loadActiveWars(),
}));
const loadRecentWars = vi.fn<() => Promise<readonly StoredWar[]>>();
vi.mock('./recentWars', () => ({
  RECENT_WARS_REREAD_MS: 1_800_000,
  loadRecentWars: () => loadRecentWars(),
}));
vi.mock('@/features/character/useEntityName', () => ({
  useEntityName: (id: number | undefined) => (id === 100 ? 'Hostile Corp' : null),
}));

const HOUR = 3_600_000;

function war(over: Partial<StoredWar> = {}): StoredWar {
  const now = Date.now();
  return {
    id: 777,
    declared: now - 30 * HOUR,
    started: now - 6 * HOUR,
    mutual: false,
    openForAllies: false,
    aggressor: { corporationId: 100, iskDestroyed: 2_500_000_000, shipsKilled: 4 },
    defender: { corporationId: 200, iskDestroyed: 100_000_000, shipsKilled: 1 },
    allies: [],
    ...over,
  };
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <WarBanner characterId={91} />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.notificationFeed.clear();
  loadRecentWars.mockReset();
  loadRecentWars.mockResolvedValue([]);
  loadActiveWars.mockReset();
  usePublicInfo.setState({
    byCharacterId: { 91: { corporationName: 'Mine', allianceName: null, corporationId: 200 } },
    load: vi.fn(async () => {}),
  });
});

describe('WarBanner', () => {
  it('draws nothing when no war is open', async () => {
    loadActiveWars.mockResolvedValue([]);
    renderBanner();
    await waitFor(() => expect(loadActiveWars).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('draws nothing for a war on someone else', async () => {
    loadActiveWars.mockResolvedValue([
      war({ defender: { corporationId: 999, iskDestroyed: 0, shipsKilled: 0 } }),
    ]);
    renderBanner();
    await waitFor(() => expect(loadActiveWars).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names the aggressor when my corporation is the target', async () => {
    loadActiveWars.mockResolvedValue([war()]);
    renderBanner();
    expect(await screen.findByText('At war with Hostile Corp')).toBeInTheDocument();
  });

  it('says how many more wars there are', async () => {
    loadActiveWars.mockResolvedValue([war(), war({ id: 778, declared: Date.now() - 60 * HOUR })]);
    renderBanner();
    expect(await screen.findByText('At war with Hostile Corp and 1 more')).toBeInTheDocument();
  });

  it('shows when a war not yet started will begin', async () => {
    loadActiveWars.mockResolvedValue([war({ started: Date.now() + 5 * HOUR + 30_000 })]);
    renderBanner();
    expect(await screen.findByText('Starts in 5h 0m')).toBeInTheDocument();
  });

  it('opens the war card from Details', async () => {
    loadActiveWars.mockResolvedValue([war()]);
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /At war with Hostile Corp/ }));
    const dialog = await screen.findByRole('dialog', { name: 'War declared' });
    expect(within(dialog).getByText('Declared war on you')).toBeInTheDocument();
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(within(dialog).getByText('They destroyed')).toBeInTheDocument();
    expect(within(dialog).getByText('4 ships')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /War on zKillboard/ })).toHaveAttribute(
      'href',
      'https://zkillboard.com/war/777/'
    );
  });

  it('does not ask ESI for recent wars with no war-declared Alert', async () => {
    loadActiveWars.mockResolvedValue([]);
    renderBanner();
    await waitFor(() => expect(loadActiveWars).toHaveBeenCalled());
    expect(loadRecentWars).not.toHaveBeenCalled();
  });

  it('shows a war from ESI right after a war-declared Alert, before the sweep has it', async () => {
    await db.notificationFeed.add({
      id: 'n1',
      characterId: 91,
      eventId: 'eveNotification',
      eveType: 'WarDeclared',
      title: 'War declared',
      body: 'Hostile Corp declared war',
      firedAt: Date.now() - HOUR,
    });
    loadActiveWars.mockResolvedValue([]);
    loadRecentWars.mockResolvedValue([war()]);
    renderBanner();
    expect(await screen.findByText('At war with Hostile Corp')).toBeInTheDocument();
  });
});
