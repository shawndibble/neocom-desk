import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { FittingCargoItem, FittingStats } from '@/engine/fittings/types';
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

function setup(
  hullGroupId: number | undefined,
  compare = vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) }),
  cargo: FittingCargoItem[] = []
) {
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
  it('shows only the picker and one hint in normal space', () => {
    setup(26);
    expect(screen.getByRole('combobox', { name: 'Abyssal weather' })).toBeTruthy();
    expect(
      screen.getByText('Pick a weather to see what it does to this fit and which filament to buy.')
    ).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Filament tier' })).toBeNull();
    expect(screen.queryByText(/Clear to run/)).toBeNull();
    expect(screen.queryByText(/Buy:/)).toBeNull();
  });

  it('puts the reference text behind the info tooltip, not inline', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
    setup(26);
    expect(screen.queryByText(/minutes per run/)).toBeNull();
    expect(screen.queryByText(/EVE University/)).toBeNull();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'About Abyssal runs' }));
    expect((await screen.findAllByText(/20 minutes per run/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/EVE University wiki/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/T3 rolls −30% or −50%/)).length).toBeGreaterThan(0);
  });

  it('reads one clear verdict line when nothing is wrong', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
    useAbyssalRunPlan.setState({ tier: 3, security: 8 });
    setup(26);
    expect(await screen.findByText('Clear to run ·')).toBeTruthy();
    expect(screen.getByText('Cruiser, solo')).toBeTruthy();
    expect(screen.getByText(/no suspect flag/)).toBeTruthy();
  });

  it('flags a Tech 3 cruiser and a tier the security blocks', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
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
    expect(screen.queryByText(/Buy:/)).toBeNull();
    expect(screen.getByText(/no CONCORD either/)).toBeTruthy();
  });

  it('marks an Interdictor as unconfirmed', async () => {
    useAbyssalWeather.setState({ weatherTypeId: 47382 });
    setup(541);
    expect(screen.getByText(/No source names this hull type/)).toBeTruthy();
  });

  describe('Buy row', () => {
    const run = async (group: number, cargo: FittingCargoItem[] = []) => {
      useAbyssalWeather.setState({ weatherTypeId: 47382 });
      setup(group, vi.fn().mockResolvedValue({ before: stats(1000), after: stats(900) }), cargo);
    };

    it('prices three for a frigate and one for a cruiser, naming the hub', async () => {
      quote(1_000_000);
      await run(25);
      expect(await screen.findByText(/x 3 · 3,000,000 ISK at Jita/)).toBeTruthy();
    });

    it('prices one for a cruiser', async () => {
      quote(1_000_000);
      await run(26);
      expect(await screen.findByText(/x 1 · 1,000,000 ISK at Jita/)).toBeTruthy();
    });

    it('offsets matching cargo and ignores other types', async () => {
      quote(1_000_000);
      await run(25, [
        { typeId: FILAMENT, quantity: 1 },
        { typeId: 47904, quantity: 9 },
      ]);
      expect(
        await screen.findByText(/x 2 more · 2,000,000 ISK at Jita \(1 in cargo\)/)
      ).toBeTruthy();
    });

    it('says covered by cargo with no ISK figure', async () => {
      quote(1_000_000);
      await run(25, [{ typeId: FILAMENT, quantity: 3 }]);
      expect(await screen.findByText(/x 3 · covered by cargo/)).toBeTruthy();
    });

    it('shows nothing when the hub has no price or the hull cannot enter', async () => {
      quote(null);
      await run(26);
      await screen.findByRole('link', { name: 'Fierce Electrical Filament' });
      await vi.waitFor(() => expect(getHubPrices).toHaveBeenCalled());
      expect(screen.queryByText(/ISK at/)).toBeNull();
    });

    it('shows nothing for a hull that cannot enter', async () => {
      quote(1_000_000);
      await run(27);
      expect(screen.queryByText(/ISK at/)).toBeNull();
    });
  });
});
