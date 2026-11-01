import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { FittingStats } from '@/engine/fittings/types';
import type { FittingCargoItem } from '@/engine/fittings/types';
import { AbyssalRunPlanner } from './AbyssalRunPlanner';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { useAbyssalWeather } from './abyssalWeatherSelection';

// A full FittingStats is far more than this test is about.
vi.mock('@/engine/fittings/variationDelta', async (original) => ({
  ...(await original<object>()),
  diffFittingStats: () => ({ changes: [{ key: 'ehp', before: 1000, after: 900 }], count: 1 }),
}));

const getHubPrices = vi.hoisted(() => vi.fn());
vi.mock('@/market/prices', async (original) => ({
  ...(await original<object>()),
  getHubPrices,
}));

const FILAMENT = 47905;
const quote = (sellMin: number | null) =>
  getHubPrices.mockResolvedValue(new Map(sellMin === null ? [] : [[FILAMENT, { sellMin }]]));

beforeEach(() => quote(null));

afterEach(() => {
  getHubPrices.mockReset();
  useAbyssalWeather.setState({ weatherTypeId: null });
  useAbyssalRunPlan.setState({ tier: 3, security: 5 });
});

const stats = (ehp: number) => ({ ehp, offense: { weapons: [] } }) as unknown as FittingStats;

function setup(hullGroupId: number | undefined, compare = vi.fn(), cargo: FittingCargoItem[] = []) {
  render(
    <MemoryRouter>
      <AbyssalRunPlanner
        hullGroupId={hullGroupId}
        compare={compare}
        cargo={cargo}
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

  describe('filament cost line', () => {
    const run = async (group: number, cargo: FittingCargoItem[] = []) => {
      useAbyssalWeather.setState({ weatherTypeId: 47382 });
      setup(group, vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) }), cargo);
    };

    it('prices three for a frigate and one for a cruiser, naming the hub', async () => {
      quote(1_000_000);
      await run(25);
      expect(
        await screen.findByText(
          'Filament cost: 3 x Fierce Electrical Filament at Jita = 3,000,000 ISK'
        )
      ).toBeTruthy();
    });

    it('prices one for a cruiser', async () => {
      quote(1_000_000);
      await run(26);
      expect(
        await screen.findByText(
          'Filament cost: 1 x Fierce Electrical Filament at Jita = 1,000,000 ISK'
        )
      ).toBeTruthy();
    });

    it('offsets matching cargo and ignores other types', async () => {
      quote(1_000_000);
      await run(25, [
        { typeId: FILAMENT, quantity: 1 },
        { typeId: 47904, quantity: 9 },
      ]);
      expect(
        await screen.findByText(
          'Filament cost: 2 more x Fierce Electrical Filament at Jita = 2,000,000 ISK (1 in cargo)'
        )
      ).toBeTruthy();
    });

    it('says covered by cargo with no ISK figure', async () => {
      quote(1_000_000);
      await run(25, [{ typeId: FILAMENT, quantity: 3 }]);
      expect(await screen.findByText('Filament cost: covered by cargo')).toBeTruthy();
    });

    it('shows nothing when the hub has no price or the hull cannot enter', async () => {
      quote(null);
      await run(26);
      await screen.findByRole('link', { name: 'Fierce Electrical Filament' });
      await vi.waitFor(() => expect(getHubPrices).toHaveBeenCalled());
      expect(screen.queryByText(/Filament cost/)).toBeNull();
    });

    it('shows nothing for a hull that cannot enter', async () => {
      quote(1_000_000);
      await run(27);
      expect(screen.queryByText(/Filament cost/)).toBeNull();
    });
  });
});
