import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingFightersPanel } from './FittingFightersPanel';

const NAMES: Record<number, string> = { 23055: 'Templar I', 37599: 'Cenobite I' };
const typeName = (typeId: number) => NAMES[typeId] ?? `#${typeId}`;
const carrier: Fitting = { name: 'C', shipTypeId: 23911, modules: [], drones: [], cargo: [] };

function stats(tubes: number, used = 0): FittingStats {
  const neutral = neutralExtendedStats();
  return {
    ...neutral,
    fighters: {
      ...neutral.fighters,
      tubes: { used, total: tubes },
      light: { used, total: 3 },
    },
  } as FittingStats;
}

/** Applies each change the panel asks for to `fitting`, the way `edit()` does. */
function applied(onChange: ReturnType<typeof vi.fn>, fitting: Fitting): Fitting {
  return onChange.mock.calls.reduce(
    (current, [change]) => (change as (f: Fitting) => Fitting)(current),
    fitting
  );
}

describe('FittingFightersPanel', () => {
  it('adds a full squadron, launched into a free tube', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FittingFightersPanel
        fitting={carrier}
        stats={stats(4)}
        onChange={onChange}
        typeName={typeName}
      />
    );
    expect(screen.getByText(/0 of 4 tubes/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Find a fighter' }), 'templar');
    await user.click(screen.getByRole('button', { name: 'Add Templar I' }));
    expect(applied(onChange, carrier).fighters).toEqual([
      { typeId: 23055, quantity: 6, state: 'active' },
    ]);
  });

  it('recalls, shrinks and removes a squadron', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fitting: Fitting = {
      ...carrier,
      fighters: [{ typeId: 23055, quantity: 6, state: 'active' }],
    };
    render(
      <FittingFightersPanel
        fitting={fitting}
        stats={stats(4, 1)}
        onChange={onChange}
        typeName={typeName}
      />
    );
    expect(screen.getByText('6/6')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Launched' }));
    await user.click(screen.getByRole('button', { name: 'One fewer Templar I' }));
    expect(applied(onChange, fitting).fighters).toEqual([
      { typeId: 23055, quantity: 5, state: 'online' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Remove Templar I' }));
    expect(applied(onChange, fitting)).not.toHaveProperty('fighters');
  });

  it('is not there for a hull without tubes and a Fitting without fighters', () => {
    const { container } = render(
      <FittingFightersPanel
        fitting={carrier}
        stats={stats(0)}
        onChange={vi.fn()}
        typeName={typeName}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
