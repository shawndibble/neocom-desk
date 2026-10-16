import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  return userEvent.setup();
}

describe('AbyssalRunPlanner', () => {
  it('flags a Tech 3 cruiser and a tier the security blocks', async () => {
    const user = setup(963);
    await user.click(screen.getByRole('button', { name: /Plan an Abyssal run/ }));
    expect(screen.getByText(/Tech 3 cruisers can't enter/)).toBeTruthy();
    useAbyssalRunPlan.setState({ security: 10 });
    expect(await screen.findByText(/can't be activated here/)).toBeTruthy();
  });

  it('names the filament to buy for the picked weather and shows what it does to the fit', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 }); // Electrical 2
    const compare = vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) });
    const user = setup(26, compare);
    await user.click(screen.getByRole('button', { name: /Plan an Abyssal run/ }));
    expect(await screen.findByRole('link', { name: 'Fierce Electrical Filament' })).toBeTruthy();
    expect(await screen.findByText(/EHP/)).toBeTruthy();
    expect(compare).toHaveBeenCalledWith(47382);
  });
});
