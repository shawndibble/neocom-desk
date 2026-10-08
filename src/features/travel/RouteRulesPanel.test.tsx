import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ROUTE_RULE_STORES } from '@/features/route/routeRules';
import type { RouteHoleQuery } from '@/features/route/routeHoleSettings';
import { RouteRulesPanel } from './RouteRulesPanel';

vi.mock('@/features/travel/routeSafetyData', () => ({
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

function renderPanel({ holes = false, bridges = false } = {}) {
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
      onHoleChange={() => undefined}
      bridges={{
        bridgeQuery: { enabled: bridges, hydrated: true },
        onBridgesChange: () => undefined,
        bridgeCount: 2,
        onManageBridges: () => undefined,
      }}
    />
  );
}

describe('RouteRulesPanel › More route options', () => {
  it('keeps wormhole and bridge settings behind a closed disclosure', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Also avoid')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Route preference' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /More route options/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /Route through Thera/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /jump bridges/i })).toBeNull();
    expect(within(toggle).queryByText(/ on$/)).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: /Route through Thera/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /jump bridges/i })).toBeInTheDocument();
  });

  it('says from the closed state how many of its rules are on, and keeps the chips', async () => {
    renderPanel({ holes: true, bridges: true });

    const toggle = await screen.findByRole('button', { name: /More route options/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2 on');
  });
});
