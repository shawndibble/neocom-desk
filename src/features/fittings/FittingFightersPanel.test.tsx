import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingFightersPanel } from './FittingFightersPanel';
import { FittingItemActionsProvider } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';

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

  it('will not launch a squadron past the class limit', () => {
    const fitting: Fitting = {
      ...carrier,
      fighters: [
        ...Array.from({ length: 3 }, () => ({
          typeId: 23055,
          quantity: 6,
          state: 'active' as const,
        })),
        { typeId: 23055, quantity: 6, state: 'online' },
      ],
    };
    render(
      <FittingFightersPanel
        fitting={fitting}
        stats={stats(4, 3)}
        onChange={vi.fn()}
        typeName={typeName}
      />
    );
    const boxes = screen.getAllByRole('checkbox', { name: 'Launched' });
    expect(boxes[3]).toBeDisabled();
    expect(boxes[0]).toBeEnabled();
  });
});

describe('FittingFightersPanel item menu', () => {
  function renderWithMenu(fitting: Fitting, fighterStats: FittingStats) {
    const onChange = vi.fn();
    const actions = fakeItemActions({ names: NAMES });
    render(
      <MemoryRouter>
        <FittingItemActionsProvider value={actions}>
          <FittingFightersPanel
            fitting={fitting}
            stats={fighterStats}
            onChange={onChange}
            typeName={typeName}
          />
        </FittingItemActionsProvider>
      </MemoryRouter>
    );
    return { onChange, actions };
  }

  async function openMenu() {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for Templar I' }), {
      button: 0,
      pointerType: 'mouse',
    });
  }

  it('moves a launched squadron to the bay, and shows its info', async () => {
    const fitting: Fitting = {
      ...carrier,
      fighters: [{ typeId: 23055, quantity: 6, state: 'active' }],
    };
    const { onChange, actions } = renderWithMenu(fitting, stats(4, 1));
    await openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to bay' }));
    expect(applied(onChange, fitting).fighters).toEqual([
      { typeId: 23055, quantity: 6, state: 'online' },
    ]);
    await openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Show info/ }));
    expect(actions.showInfo).toHaveBeenCalledWith(23055, 'Templar I');
  });

  it('launches a bay squadron only while a tube is free, and removes one', async () => {
    const fitting: Fitting = {
      ...carrier,
      fighters: [{ typeId: 23055, quantity: 6, state: 'online' }],
    };
    const { onChange } = renderWithMenu(fitting, stats(0));
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Launch' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Templar I' }));
    expect(applied(onChange, fitting).fighters ?? []).toEqual([]);
  });
});
