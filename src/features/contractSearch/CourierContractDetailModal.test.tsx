import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';
import type { RouteExposure } from '@/features/contractSearch/routeExposure';
import {
  CourierContractDetailModal,
  type CourierJumps,
} from '@/features/contractSearch/CourierContractDetailModal';

const routeExposure = vi.fn<() => Promise<RouteExposure>>();
vi.mock('@/features/contractSearch/routeExposure', () => ({
  routeExposure: () => routeExposure(),
}));

let lawlessSystems: ReadonlySet<number> = new Set();
vi.mock('@/features/travel/useLawlessSystems', () => ({
  useLawlessSystems: () => lawlessSystems,
}));

// Hydrated at once, so the modal asks for its route on first render.
const RULES = { preference: 'prefer-highsec' as const };
vi.mock('@/features/route/routeRules', () => ({
  useRouteQuery: () => ({ rules: RULES, key: 'k', hydrated: true, podKillsUnavailable: false }),
}));

function endpoint(systemId: number, systemName: string): CourierEndpoint {
  return {
    locationId: 60003760,
    name: `${systemName} station`,
    systemName,
    systemId,
    regionId: 10000002,
    security: 0.9459,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
  };
}

const ROW: CourierRouteRow = {
  contractId: 1,
  regionId: 10000002,
  originLocationId: 60003760,
  destinationLocationId: 60008494,
  reward: 5_000_000,
  volume: 1_000,
  dateExpired: Date.now() + 86_400_000,
  origin: endpoint(30000142, 'Jita'),
  destination: endpoint(30002187, 'Amarr'),
};

const KNOWN: RouteExposure = {
  kind: 'known',
  exposedSystems: 1,
  totalSystems: 3,
  chokepoints: ['Uedama'],
  path: [
    { systemId: 30000142, name: 'Jita', security: 0.9459, chokepoint: false },
    { systemId: 30002768, name: 'Uedama', security: 0.4977, chokepoint: true },
    { systemId: 30002187, name: 'Amarr', security: 1, chokepoint: false },
  ],
};

function renderModal(
  jumps: CourierJumps = { kind: 'known', count: 2 },
  extra: { returnFocusFallback?: () => HTMLElement | null } = {}
) {
  return render(
    <MemoryRouter>
      <CourierContractDetailModal
        row={ROW}
        regionNames={new Map()}
        jumps={jumps}
        goingRateMultiple={null}
        preference="prefer-highsec"
        reverseLane={{ kind: 'unresolved' }}
        onSearchReverseLane={() => {}}
        onClose={() => {}}
        {...extra}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  routeExposure.mockReset();
  lawlessSystems = new Set();
});

describe('CourierContractDetailModal route path', () => {
  it('links the system name to Route Safety', () => {
    renderModal();
    const link = screen.getByRole('link', { name: 'Jita' });
    expect(link).toHaveAttribute('href', expect.stringContaining('30000142'));
  });

  it('opens the route system by system, each with its security, from the jump count', async () => {
    routeExposure.mockResolvedValue(KNOWN);
    const user = userEvent.setup();
    renderModal();

    const toggle = await screen.findByRole('button', { name: '2 jumps' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Route, system by system' })).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = within(
      screen.getByRole('list', { name: 'Route, system by system' })
    ).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Jita0.9',
      'Uedama0.5Gank Chokepoint',
      'Amarr1.0',
    ]);

    await user.click(toggle);
    expect(screen.queryByRole('list', { name: 'Route, system by system' })).toBeNull();
  });

  it('tags a lawless system on the route', async () => {
    routeExposure.mockResolvedValue(KNOWN);
    lawlessSystems = new Set([30000142]);
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole('button', { name: '2 jumps' }));

    const items = within(
      screen.getByRole('list', { name: 'Route, system by system' })
    ).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Jita0.9Lawless',
      'Uedama0.5Gank Chokepoint',
      'Amarr1.0',
    ]);
  });

  it('keeps the count as plain text when the route could not be worked out', async () => {
    routeExposure.mockResolvedValue({ kind: 'unknown' });
    renderModal();

    expect(await screen.findByText(/Route not worked out/)).toBeInTheDocument();
    expect(screen.getByText('2 jumps').tagName).not.toBe('BUTTON');
  });
});

describe('CourierContractDetailModal contract ID', () => {
  it('puts a copy button beside the contract ID', () => {
    routeExposure.mockResolvedValue(KNOWN);
    renderModal();
    expect(screen.getByRole('button', { name: 'Copy contract ID' })).toBeInTheDocument();
  });
});

describe('CourierContractDetailModal focus return', () => {
  it('passes returnFocusFallback through to the modal', () => {
    routeExposure.mockResolvedValue(KNOWN);
    const fallback = vi.fn(() => null);
    const { unmount } = renderModal({ kind: 'known', count: 2 }, { returnFocusFallback: fallback });
    unmount();
    expect(fallback).toHaveBeenCalled();
  });
});
