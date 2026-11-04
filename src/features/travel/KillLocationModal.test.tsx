import '@/i18n';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentKillLocation, RecentKillView } from '@/engine/route/recentKills';
import { KillLocationModal } from './KillLocationModal';

const { resolveNames, loadGroupNames } = vi.hoisted(() => ({
  resolveNames: vi.fn(),
  loadGroupNames: vi.fn(),
}));
vi.mock('@/features/character/names', () => ({ resolveNames }));
vi.mock('@/features/market/groupNames', () => ({ loadGroupNames }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: () =>
    Promise.resolve({
      '648': { name: 'Badger' },
      '4306': { name: 'Tornado' },
      '22456': { name: 'Sabre' },
      '2921': { name: '800mm Repeating Cannon' },
    }),
}));

const NOW = Date.parse('2026-09-30T05:30:00Z');

function kill(id: number, minutesAgo: number, extra: Partial<RecentKillView> = {}): RecentKillView {
  return {
    killmailId: id,
    time: NOW - minutesAgo * 60_000,
    locationId: 1,
    attackers: [],
    bubble: false,
    smartbomb: false,
    victim: { characterId: 100 + id, corporationId: 200, allianceId: null, shipTypeId: 648 },
    value: 412_000_000,
    ...extra,
  };
}

function location(
  name: string | null,
  kills: RecentKillView[],
  onPath = false
): RecentKillLocation {
  return {
    key: name ?? 'other',
    kind: name === null ? 'other' : 'stargate',
    name,
    onPath,
    count: kills.length,
    minutesSinceLast: 4,
    kills,
    hulls: [{ groupId: 1201, kills: kills.length }],
    bubble: false,
    smartbomb: false,
  };
}

const crowd = Array.from({ length: 20 }, (_, i) => ({
  shipTypeId: 4306,
  weaponTypeId: 2921,
  characterId: 1000 + i,
  ...(i === 17 ? { finalBlow: true } : {}),
}));

describe('KillLocationModal', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resolveNames.mockReset();
    loadGroupNames.mockReset();
    resolveNames.mockImplementation((ids: number[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, `Name ${id}`])))
    );
    loadGroupNames.mockResolvedValue(new Map([[1201, 'Battlecruiser']]));
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('lists one location: victims by name, hull summary counting kills, newest first', async () => {
    render(
      <KillLocationModal
        open
        onClose={() => undefined}
        systemId={30002813}
        systemName="Tama"
        scope="location"
        hulls={[{ groupId: 1201, kills: 3 }]}
        locations={[
          location('Stargate (Nourvukaiken)', [
            kill(1, 4, { bubble: true }),
            kill(2, 19),
            kill(3, 32, { smartbomb: true }),
          ]),
        ]}
      />
    );
    expect(await screen.findByText('Name 101')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Stargate \(Nourvukaiken\) · Tama/ })).toBeVisible();
    expect(await screen.findByText('Battlecruiser on 3 of 3 kills')).toBeInTheDocument();
    expect(screen.getAllByText('Interdictor or HIC on the mail')).toHaveLength(2);
    expect(screen.getAllByText('Smartbombs involved')).toHaveLength(2);
    // One batched names read for every victim pilot and corporation.
    expect(resolveNames).toHaveBeenCalledTimes(1);
    const rows = screen.getAllByRole('button', { expanded: false });
    expect(rows[0]).toHaveAccessibleName(/Name 101/);
  });

  it('shows a section per location for the system, on-path gates first', async () => {
    render(
      <KillLocationModal
        open
        onClose={() => undefined}
        systemId={30002813}
        systemName="Tama"
        scope="system"
        hulls={[{ groupId: 1201, kills: 3 }]}
        locations={[
          location('Stargate (Sivala)', [kill(5, 11)]),
          location('Stargate (Nourvukaiken)', [kill(1, 4), kill(2, 19)], true),
        ]}
      />
    );
    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      expect.stringContaining('Stargate (Nourvukaiken)'),
      expect.stringContaining('Stargate (Sivala)'),
    ]);
    expect(screen.getByText('3 kills at 2 places')).toBeInTheDocument();
  });

  it('expands a kill to its attackers, capped, with the final blow kept in view', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <KillLocationModal
        open
        onClose={() => undefined}
        systemId={1}
        systemName="Tama"
        scope="location"
        hulls={[{ groupId: 1201, kills: 1 }]}
        locations={[location('Stargate (X)', [kill(1, 4, { attackers: crowd })])]}
      />
    );
    await user.click(await screen.findByRole('button', { name: /Name 101/ }));
    expect(await screen.findByText(/and 5 more/)).toBeInTheDocument();
    expect(screen.getByText('Final blow')).toBeInTheDocument();
    expect(screen.getByText('Name 1017')).toBeInTheDocument();
    expect(screen.queryByText('Name 1019')).not.toBeInTheDocument();
  });

  it('leaves out a name that never resolved and invents nothing', async () => {
    resolveNames.mockResolvedValue(new Map());
    loadGroupNames.mockResolvedValue(new Map());
    render(
      <KillLocationModal
        open
        onClose={() => undefined}
        systemId={1}
        systemName="Tama"
        scope="location"
        hulls={[{ groupId: 1201, kills: 1 }]}
        locations={[location('Stargate (X)', [kill(1, 4)])]}
      />
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Badger')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Unknown/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Battlecruiser/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('1 kill')).toBeInTheDocument();
  });
});
