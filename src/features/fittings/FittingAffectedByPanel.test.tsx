import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { AffectedAttribute } from '@/engine/fittings/affectedBy';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: async () => ({
    64: { name: 'Damage Modifier', unit: 'x', category: 'Turret' },
    51: { name: 'Rate of fire', unit: 's', category: 'Turret' },
  }),
}));

const { FittingAffectedByPanel } = await import('./FittingAffectedByPanel');

const NAMES: Record<number, string> = { 3315: 'Surgical Strike', 519: 'Gyrostabilizer II' };
const typeName = (typeId: number) => NAMES[typeId] ?? `#${typeId}`;

const damage: AffectedAttribute = {
  attributeId: 64,
  base: 2.5,
  value: 3.4,
  sources: [
    {
      kind: 'skill',
      typeId: 3315,
      operator: 'post_percent',
      value: 15,
      penalty: null,
      applied: true,
    },
    { kind: 'item', typeId: 519, operator: 'pre_mul', value: 1.1, penalty: 0.869, applied: true },
    {
      kind: 'buff',
      typeId: null,
      buffId: 12,
      operator: 'post_percent',
      value: 5,
      penalty: null,
      applied: false,
    },
  ],
};

describe('FittingAffectedByPanel', () => {
  it('lists each changed attribute, base to value, with what changed it', async () => {
    const explain = vi.fn(async () => [damage, { ...damage, attributeId: -12 }]);
    render(<FittingAffectedByPanel explain={explain} moduleIndex={2} typeName={typeName} />);

    expect(await screen.findByText('Damage Modifier')).toBeInTheDocument();
    expect(explain).toHaveBeenCalledWith(2);
    expect(screen.getByText('2.5 x → 3.4 x')).toBeInTheDocument();
    expect(screen.getByText('Surgical Strike')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('×1.1')).toBeInTheDocument();
    expect(screen.getByText('stacking penalty 87%')).toBeInTheDocument();
    expect(screen.getByText(/Fleet boost #12/)).toBeInTheDocument();
    expect(screen.getByText(/not running/)).toBeInTheDocument();
  });

  it('waits for the engine, and says when nothing changes the module', async () => {
    const { rerender } = render(
      <FittingAffectedByPanel explain={null} moduleIndex={0} typeName={typeName} />
    );
    expect(screen.getByText('Working out what affects it…')).toBeInTheDocument();
    rerender(
      <FittingAffectedByPanel explain={async () => []} moduleIndex={0} typeName={typeName} />
    );
    expect(
      await screen.findByText("Nothing changes this module's attributes.")
    ).toBeInTheDocument();
  });
});
