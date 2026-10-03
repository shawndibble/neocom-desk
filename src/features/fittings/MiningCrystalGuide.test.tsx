import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { ChargeChoice } from '@/engine/fittings/chargeChoice';
import type { CrystalFigures } from '@/engine/fittings/mining';
import { MiningCrystalGuide } from './MiningCrystalGuide';
import type { WeaponChargeGroup } from './useChargeChoices';

function crystal(
  typeId: number,
  name: string,
  price: number | null,
  mining: Omit<CrystalFigures, 'removedM3s'>
): ChargeChoice {
  return {
    typeId,
    name,
    baseTypeId: typeId,
    baseName: name,
    tier: name.endsWith(' II') ? 'tech2' : 'tech1',
    faction: null,
    dps: 0,
    optimal: 0,
    falloff: 0,
    damage: null,
    price,
    roundsPerMinute: null,
    cargo: 0,
    skillMissing: false,
    mining: { ...mining, removedM3s: mining.m3PerSecond + mining.residueM3s },
  };
}

const figures = (m3PerSecond: number, cycleSeconds: number, chance: number, mult: number) => ({
  m3PerSecond,
  cycleSeconds,
  residueChance: chance,
  residueMultiplier: mult,
  residueM3s: (m3PerSecond / 1.02) * chance * mult,
});

const choices = [
  crystal(
    60281,
    'Simple Asteroid Mining Crystal Type A II',
    950_000,
    figures(12.7, 37.1, 0.376, 1)
  ),
  crystal(60276, 'Simple Asteroid Mining Crystal Type A I', 120_000, figures(10.6, 37.1, 0.34, 1)),
  crystal(60284, 'Simple Asteroid Mining Crystal Type C II', 900_000, figures(1.4, 37.1, 0.93, 29)),
  crystal(
    60285,
    'Coherent Asteroid Mining Crystal Type A I',
    130_000,
    figures(10.6, 37.1, 0.34, 1)
  ),
];

const group: WeaponChargeGroup = {
  moduleTypeId: 17912,
  slot: 'high',
  count: 2,
  loaded: new Set([60281]),
  isWeapon: false,
  isCapBooster: false,
  isMiner: true,
  choices,
};

describe('MiningCrystalGuide', () => {
  it('says what A, B and C are for, in a line each', () => {
    render(<MiningCrystalGuide group={group} pricesLoading={false} />);
    const help = within(screen.getByRole('list', { name: 'Crystal types' }));
    expect(help.getAllByRole('listitem')).toHaveLength(4);
    expect(help.getByText(/most ore from each rock/i)).toBeInTheDocument();
  });

  it('names the loaded crystal and its yield', () => {
    render(<MiningCrystalGuide group={group} pricesLoading={false} />);
    expect(screen.getByText(/Loaded/).parentElement).toHaveTextContent(
      /Simple Asteroid Mining Crystal Type A II.*12\.7 m³\/s/
    );
  });

  it("opens only the loaded crystal's ore family; another opens on its header, naming its ores", async () => {
    const user = userEvent.setup();
    render(<MiningCrystalGuide group={group} pricesLoading={false} />);
    const simple = screen.getByRole('button', { name: /^Simple Asteroid: Veldspar/ });
    const coherent = screen.getByRole('button', { name: /^Coherent Asteroid: Omber/ });
    expect(simple).toHaveAttribute('aria-expanded', 'true');
    expect(coherent).toHaveAttribute('aria-expanded', 'false');
    expect(coherent).toHaveTextContent('Omber, Kernite, Jaspet, Hemorphite, Hedbergite');

    await user.click(coherent);
    expect(coherent).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: /^Coherent Asteroid Mining Crystal Type A I,/ })
    ).toBeInTheDocument();
  });

  it("lists a family's crystals A I first, each with its yield, cycle, residue and price, and loads one", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<MiningCrystalGuide group={group} onLoad={onLoad} pricesLoading={false} />);
    const rows = screen.getAllByRole('button', { name: /^Simple Asteroid Mining Crystal/ });
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Simple Asteroid Mining Crystal Type A I, 10.6 m³/s, 37s cycle, 34% residue chance at 1×, 120K ISK',
      'Simple Asteroid Mining Crystal Type A II, 12.7 m³/s, 37s cycle, 38% residue chance at 1×, 950K ISK',
      'Simple Asteroid Mining Crystal Type C II, 1.4 m³/s, 37s cycle, 93% residue chance at 29×, 900K ISK',
    ]);
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
    await user.click(rows[2]!);
    expect(onLoad).toHaveBeenCalledWith(60284);
  });
});
