import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { ChargeChoice } from '@/engine/fittings/chargeChoice';
import type { CapBoosterFigures } from '@/engine/fittings/capBoosterChoice';
import { CapBoosterGuide } from './CapBoosterGuide';
import type { WeaponChargeGroup } from './useChargeChoices';

function booster(
  typeId: number,
  name: string,
  price: number | null,
  cap: CapBoosterFigures
): ChargeChoice {
  const navy = name.startsWith('Navy');
  return {
    typeId,
    name,
    baseTypeId: typeId,
    baseName: name,
    tier: navy ? 'faction' : 'tech1',
    faction: navy ? 'Navy' : null,
    dps: 0,
    optimal: 0,
    falloff: 0,
    damage: null,
    price,
    roundsPerMinute: null,
    cargo: 0,
    skillMissing: false,
    cap,
  };
}

const dry = (seconds: number) => ({ stable: false as const, depletesInSeconds: seconds });
const stable = (pct: number) => ({ stable: true as const, stablePercentage: pct });

const choices = [
  booster(11285, 'Cap Booster 200', 40, {
    injection: 200,
    gjPerSecond: 15,
    boostsPerLoad: 8,
    capacitor: dry(95),
  }),
  booster(11287, 'Cap Booster 400', 120, {
    injection: 400,
    gjPerSecond: 28,
    boostsPerLoad: 4,
    capacitor: stable(38),
  }),
  // Cheaper than the Tech I 400, injects more and holds the capacitor higher.
  booster(32006, 'Navy Cap Booster 400', 110, {
    injection: 400,
    gjPerSecond: 30,
    boostsPerLoad: 5,
    capacitor: stable(44),
  }),
  booster(11289, 'Cap Booster 800', 300, {
    injection: 800,
    gjPerSecond: 52,
    boostsPerLoad: 2,
    capacitor: stable(71),
  }),
];

const group: WeaponChargeGroup = {
  moduleTypeId: 3554,
  slot: 'medium',
  count: 1,
  loaded: new Set([11289]),
  isWeapon: false,
  isCapBooster: true,
  isMiner: false,
  choices,
};

describe('CapBoosterGuide', () => {
  it('says what is loaded and how the capacitor fares with it', () => {
    render(<CapBoosterGuide group={group} pricesLoading={false} />);
    expect(screen.getByText(/Loaded/).parentElement).toHaveTextContent(
      /Cap Booster 800.*Stable at 71%/
    );
  });

  it('quick-picks the smallest stable charge, the most GJ/s and the cheapest stable GJ, and loads one', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<CapBoosterGuide group={group} onLoad={onLoad} pricesLoading={false} />);
    const picks = within(screen.getByRole('group', { name: 'Quick picks' }));
    expect(
      picks.getByRole('button', { name: /Smallest stable.*Navy Cap Booster 400/ })
    ).toBeTruthy();
    expect(picks.getByRole('button', { name: /Most GJ\/s.*Cap Booster 800/ })).toBeTruthy();
    // 110 ISK / 400 GJ beats 300 / 800 and 120 / 400; the 200 is cheaper per GJ but runs dry.
    expect(picks.getByRole('button', { name: /Most GJ\/s/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(picks.getByRole('button', { name: /Best value.*Navy Cap Booster 400/ }));
    expect(onLoad).toHaveBeenCalledWith(32006);
  });

  it('lists every charge smallest first, with its capacitor, GJ/s, boosts per load and ISK per GJ', () => {
    render(<CapBoosterGuide group={group} pricesLoading={false} />);
    const rows = screen.getAllByRole('button', { name: /, (stable at|empty in)/i });
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Cap Booster 200, empty in 1m 35s, 15 GJ/s, 8 per load, 40 ISK, 0.2 ISK/GJ',
      'Cap Booster 400, stable at 38%, 28 GJ/s, 4 per load, 120 ISK, 0.3 ISK/GJ, Navy Cap Booster 400 does as much for less',
      'Navy Cap Booster 400, stable at 44%, 30 GJ/s, 5 per load, 110 ISK, 0.28 ISK/GJ',
      'Cap Booster 800, stable at 71%, 52 GJ/s, 2 per load, 300 ISK, 0.38 ISK/GJ',
    ]);
    expect(rows[3]).toHaveAttribute('aria-pressed', 'true');
  });

  it('dims a charge another beats on every count for less, and says which', () => {
    render(<CapBoosterGuide group={group} pricesLoading={false} />);
    const t1 = screen.getByRole('button', { name: /^Cap Booster 400,/ });
    expect(t1).toHaveClass('opacity-50');
    expect(t1).toHaveTextContent('Navy Cap Booster 400 does as much for less');
    // The label replaces the row's text, so it carries the reason too.
    expect(t1).toHaveAccessibleName(/, Navy Cap Booster 400 does as much for less$/);
  });

  it('says when no charge holds the capacitor', () => {
    const allDry = {
      ...group,
      choices: choices.map((c) => ({ ...c, cap: { ...c.cap!, capacitor: dry(60) } })),
    };
    render(<CapBoosterGuide group={allDry} pricesLoading={false} />);
    expect(screen.getByText('No charge keeps this fit cap stable.')).toBeInTheDocument();
  });
});
