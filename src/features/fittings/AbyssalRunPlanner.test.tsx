import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { FittingStats } from '@/engine/fittings/types';
import { AbyssalRunPlanner } from './AbyssalRunPlanner';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { useAbyssalWeather } from './abyssalWeatherSelection';

// A full FittingStats is far more than this test is about.
vi.mock('@/engine/fittings/variationDelta', async (original) => ({
  ...(await original<object>()),
  diffFittingStats: () => ({ changes: [{ key: 'ehp', before: 1000, after: 900 }], count: 1 }),
}));

afterEach(() => {
  useAbyssalWeather.setState({ weatherTypeId: null });
  useAbyssalRunPlan.setState({ tier: 3, security: 5 });
});

const stats = (ehp: number) => ({ ehp, offense: { weapons: [] } }) as unknown as FittingStats;

function setup(hullGroupId: number | undefined, compare = vi.fn()) {
  render(
    <MemoryRouter>
      <AbyssalRunPlanner
        hullGroupId={hullGroupId}
        compare={compare}
        typeName={(id) => (id === 47905 ? 'Fierce Electrical Filament' : `#${id}`)}
      />
    </MemoryRouter>
  );
}

describe('AbyssalRunPlanner', () => {
  it('flags a Tech 3 cruiser and a tier the security blocks', async () => {
    setup(963);
    expect(screen.getByText(/Tech 3 cruisers can't enter/)).toBeTruthy();
    useAbyssalRunPlan.setState({ security: 10 });
    expect(await screen.findByText(/can't be activated here/)).toBeTruthy();
  });

  it('names the filament to buy for the picked weather and shows what it does to the fit', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 }); // Electrical 2
    const compare = vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) });
    setup(26, compare);
    expect(await screen.findByRole('link', { name: 'Fierce Electrical Filament' })).toBeTruthy();
    expect(await screen.findByText(/EHP/)).toBeTruthy();
    expect(compare).toHaveBeenCalledWith(47382);
  });

  it('names the tier-and-kind filament for a strength the tier never rolls, and the tiers that do', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47383 }); // Electrical 3: −70%
    const compare = vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) });
    setup(26, compare);
    expect(await screen.findByRole('link', { name: 'Fierce Electrical Filament' })).toBeTruthy();
    expect(
      screen.getByText(
        'T3 rolls −30% or −50%, never −70% (T4–T6 do). The numbers below are for −70%.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/pick another/)).toBeNull();
  });

  it('says so when the engine fails, rather than working forever', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
    setup(26, vi.fn().mockRejectedValue(new Error('offline')));
    expect(await screen.findByText(/Couldn't work out this fit/)).toBeTruthy();
  });

  it('offers no filament to a hull that can not enter, and warns below 0.5', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
    useAbyssalRunPlan.setState({ security: 0 });
    setup(27, vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) }));
    expect(screen.getByText(/Too big/)).toBeTruthy();
    expect(screen.queryByText(/Buy \d filament/)).toBeNull();
    expect(screen.getByText(/no CONCORD either/)).toBeTruthy();
  });

  it('marks an Interdictor as unconfirmed', async () => {
    setup(541);
    expect(screen.getByText(/No source names this hull type/)).toBeTruthy();
  });
});
