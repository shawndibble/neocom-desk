import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ROUTE_RULE_STORES } from '@/features/route/routeRules';
import type { RouteHoleChange, RouteHoleQuery } from '@/features/route/routeHoleSettings';
import { RouteHoleFields, RouteRulesPanel } from './RouteRulesPanel';

vi.mock('@/features/route/routeShip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/route/routeShip')>();
  return {
    ...actual,
    useRouteShipMass: () => ({
      ship: null,
      holeTable: {},
      hulls: [
        { typeId: 638, name: 'Raven', groupId: 27, massKg: 100_000_000 },
        { typeId: 1, name: 'Orca', groupId: 28, massKg: 100_000_000 },
      ],
    }),
  };
});

vi.mock('@/features/route/routeSafetyData', () => ({
  loadPodKills: async () => new Map<number, number>(),
}));
vi.mock('@/sde/loadMarketSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadMarketSde')>();
  return { ...actual, loadSolarSystems: async () => [] };
});

beforeEach(async () => {
  await db.settings.clear();
  for (const store of ROUTE_RULE_STORES) {
    (store.setState as (partial: { hydrated: boolean }) => void)({ hydrated: false });
  }
});

function renderPanel({
  holes = false,
  bridges = false,
  onBrowseWormholes = () => undefined,
  onHoleChange = () => undefined,
}: {
  holes?: boolean;
  bridges?: boolean;
  onBrowseWormholes?: () => void;
  onHoleChange?: (change: RouteHoleChange) => void;
} = {}) {
  const holeQuery: RouteHoleQuery = {
    enabled: holes,
    settings: { shipSize: 'medium', minLifeHours: 1, hubs: 'all' },
    hydrated: true,
  };
  return render(
    <RouteRulesPanel
      preference="prefer-highsec"
      onPreferenceChange={() => undefined}
      holeQuery={holeQuery}
      onHoleChange={onHoleChange}
      bridges={{
        bridgeQuery: { enabled: bridges, hydrated: true },
        onBridgesChange: () => undefined,
        bridgeCount: 2,
        onManageBridges: () => undefined,
      }}
      jump={{
        enabled: false,
        onEnabledChange: () => undefined,
        range: 'max',
        onRangeChange: () => undefined,
      }}
      onBrowseWormholes={onBrowseWormholes}
    />
  );
}

describe('RouteRulesPanel › More route options', () => {
  it('keeps the Thera / Turnur switch out, and the rest behind a closed disclosure', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Also avoid')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Route preference' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /More route options/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('checkbox', { name: 'Route through Thera / Turnur' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /jump bridges/i })).toBeNull();
    expect(within(toggle).queryByText(/ on$/)).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('checkbox', { name: /Route through Thera/ })).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /jump bridges/i })).toBeInTheDocument();
  });

  it('says from the closed state how many of its hidden rules are on', async () => {
    renderPanel({ holes: true, bridges: true });

    const toggle = await screen.findByRole('button', { name: /More route options/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('1 on');
  });
});

describe('RouteHoleFields › My ship', () => {
  function renderFields() {
    const onChange = vi.fn();
    render(
      <RouteHoleFields
        query={{
          enabled: true,
          settings: { shipSize: 'medium', minLifeHours: 1, hubs: 'all' },
          hydrated: true,
        }}
        onChange={onChange}
        bridges={{
          bridgeQuery: { enabled: false, hydrated: true },
          onBridgesChange: () => undefined,
          bridgeCount: 0,
          onManageBridges: () => undefined,
        }}
      />
    );
    return onChange;
  }

  it('sets My ship fits from the hull and says so, until the size is edited', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Ship I am moving' }));
    await user.click(await screen.findByRole('option', { name: 'Raven' }));

    expect(onChange).toHaveBeenCalledWith({ field: 'shipSize', value: 'large' });
    expect(screen.getByText('Set from Raven')).toBeInTheDocument();

    await user.click(within(screen.getByRole('group', { name: 'My ship fits' })).getByText('S'));
    expect(screen.queryByText('Set from Raven')).toBeNull();
  });

  it('leaves the size alone for a hull the map does not name', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    await user.click(screen.getByRole('combobox', { name: 'Ship I am moving' }));
    await user.click(await screen.findByRole('option', { name: 'Orca' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Set from/)).toBeNull();
  });
});

describe('RouteRulesPanel › Thera / Turnur switch', () => {
  it('toggles from its label, and only Browse open wormholes opens the modal', async () => {
    const user = userEvent.setup();
    const onBrowseWormholes = vi.fn();
    const onHoleChange = vi.fn();
    renderPanel({ onBrowseWormholes, onHoleChange });

    await user.click(await screen.findByText('Route through Thera / Turnur'));
    expect(onHoleChange).toHaveBeenCalledWith({ field: 'enabled', value: true });
    expect(screen.queryByRole('button', { name: 'Route through Thera / Turnur' })).toBeNull();
    expect(onBrowseWormholes).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /More route options/ }));
    await user.click(screen.getByRole('button', { name: 'Browse open wormholes' }));
    expect(onBrowseWormholes).toHaveBeenCalledTimes(1);
  });
});
