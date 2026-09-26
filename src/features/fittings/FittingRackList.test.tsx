import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { DroneSection, FittingRackList as EditableRackList } from './FittingRackList';
import { FITTING_DRAG_TYPE, useFittingDrag, type FittingDragPayload } from './fittingDrag';
import { FittingItemActionsProvider, type FittingItemActions } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';

type RackListProps = Parameters<typeof EditableRackList>[0];

/** The read-only props these tests care about; the editing ones get inert defaults. */
function FittingRackList(
  props: Pick<RackListProps, 'fitting' | 'stats' | 'unusableModuleKeys'> &
    Partial<Pick<RackListProps, 'moduleResults' | 'edit'>>
) {
  return (
    <EditableRackList
      moduleResults={null}
      catalogue={null}
      engineReady={false}
      profile={null}
      edit={() => {}}
      target={null}
      onSelectTarget={() => {}}
      {...props}
    />
  );
}

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 10, state: 'active' },
    { slot: 'low', slotIndex: 0, typeId: 11, state: 'online' },
  ],
  drones: [],
  cargo: [],
};

function statsWith(cpuUsed: number): FittingStats {
  return { cpuUsed, cpuTotal: 100, powergridUsed: 10, powergridTotal: 100 } as FittingStats;
}

describe('FittingRackList', () => {
  it('states the overage in words and flashes once when it goes over budget', () => {
    const { rerender, container } = render(
      <FittingRackList fitting={fitting} stats={statsWith(90)} />
    );
    expect(screen.queryByText(/Over by/)).toBeNull();
    expect(container.querySelector('.flash-danger')).toBeNull();

    rerender(<FittingRackList fitting={fitting} stats={statsWith(112.5)} />);
    expect(screen.getByText('Over by 12.5')).toBeTruthy();
    expect(container.querySelectorAll('.flash-danger')).toHaveLength(1);
  });

  it('does not flash again while it stays over budget, or across a recompute gap', () => {
    const { rerender, container } = render(
      <FittingRackList fitting={fitting} stats={statsWith(112)} />
    );
    rerender(<FittingRackList fitting={fitting} stats={null} />);
    rerender(<FittingRackList fitting={fitting} stats={statsWith(115)} />);
    // Still the first flash element (same key), never a re-mounted second one.
    expect(container.querySelectorAll('.flash-danger')).toHaveLength(1);
  });

  it("marks only the modules the Character can't use, with text", () => {
    render(
      <FittingRackList
        fitting={fitting}
        stats={statsWith(10)}
        unusableModuleKeys={new Set(['high-0'])}
      />
    );
    expect(screen.getAllByText("Can't use")).toHaveLength(1);
  });

  it('has no Drones section or bandwidth bar on a hull without a drone bay', () => {
    const noBay = { ...statsWith(10), droneCapacity: 0, droneBandwidthTotal: 0 };
    const { rerender } = render(<FittingRackList fitting={fitting} stats={noBay} />);
    expect(screen.queryByText('Drones')).toBeNull();
    expect(screen.queryByRole('meter', { name: 'Drone bandwidth' })).toBeNull();

    rerender(
      <FittingRackList
        fitting={fitting}
        stats={{ ...noBay, droneCapacity: 25, droneBandwidthTotal: 25 }}
      />
    );
    expect(screen.getByText('Drones')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Drone bandwidth' })).toBeTruthy();
  });

  it('shows the state a passive module actually reaches, and offers nothing above it', () => {
    // A pasted fit asks for "active" everywhere; the engine runs a passive low online.
    const pasted: Fitting = {
      ...fitting,
      modules: fitting.modules.map((module) => ({ ...module, state: 'active' })),
    };
    render(
      <FittingRackList
        fitting={pasted}
        stats={statsWith(10)}
        moduleResults={[
          { state: 'active', maxState: 'overload', chargeGroupIds: [] },
          { state: 'online', maxState: 'online', chargeGroupIds: [] },
        ]}
      />
    );
    const passive = screen.getByLabelText('State of #11') as HTMLSelectElement;
    expect(passive.value).toBe('online');
    expect([...passive.options].map((option) => option.value)).toEqual(['offline', 'online']);
  });

  it('lists the cargo, edits a quantity and removes a type', () => {
    const edits: Fitting[] = [];
    const carrying: Fitting = { ...fitting, cargo: [{ typeId: 209, quantity: 1535 }] };
    render(
      <FittingRackList
        fitting={carrying}
        stats={statsWith(10)}
        edit={(apply) => edits.push(apply(carrying))}
      />
    );
    expect(screen.getByText('Cargo')).toBeTruthy();
    const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantity.value).toBe('1535');

    fireEvent.change(quantity, { target: { value: '400' } });
    expect(edits.at(-1)?.cargo).toEqual([{ typeId: 209, quantity: 400 }]);
    // Emptying the box on the way to a new number keeps the row.
    fireEvent.change(quantity, { target: { value: '0' } });
    expect(edits).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove #209' }));
    expect(edits.at(-1)?.cargo).toEqual([]);
  });

  it('shows a type pasted as two cargo stacks as one row, and edits it as one', () => {
    const edits: Fitting[] = [];
    const split: Fitting = {
      ...fitting,
      cargo: [
        { typeId: 209, quantity: 100 },
        { typeId: 209, quantity: 50 },
      ],
    };
    render(
      <FittingRackList
        fitting={split}
        stats={statsWith(10)}
        edit={(apply) => edits.push(apply(split))}
      />
    );
    const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantity.value).toBe('150');
    fireEvent.change(quantity, { target: { value: '400' } });
    expect(edits.at(-1)?.cargo).toEqual([{ typeId: 209, quantity: 400 }]);
  });

  it('has no Cargo section when nothing is carried', () => {
    render(<FittingRackList fitting={fitting} stats={statsWith(10)} />);
    expect(screen.queryByText('Cargo')).toBeNull();
  });

  it("keeps a pasted fit's drones on such a hull, so they can be removed", () => {
    const noBay = { ...statsWith(10), droneCapacity: 0, droneBandwidthTotal: 0 };
    render(
      <FittingRackList
        fitting={{ ...fitting, drones: [{ typeId: 2486, quantity: 2, state: 'active' }] }}
        stats={noBay}
      />
    );
    expect(screen.getByText('Drones')).toBeTruthy();
    // The two modules' removes, and the drones'.
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(3);
  });
});

describe('DroneSection', () => {
  const withDrones: Fitting = {
    ...fitting,
    drones: [
      { typeId: 2486, quantity: 2, state: 'active' },
      { typeId: 2486, quantity: 3, state: 'online' },
    ],
  };
  const stats = { ...statsWith(10), droneCapacity: 25, droneBandwidthTotal: 25 };

  it('carries its own bandwidth and bay bars on the Ring, and the launched and bay counts', () => {
    render(
      <DroneSection
        fitting={withDrones}
        catalogue={null}
        stats={stats}
        edit={() => {}}
        target={null}
        onSelectTarget={() => {}}
        variant="panel"
      />
    );
    expect(screen.getByRole('meter', { name: 'Drone bandwidth' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Drone bay (m³)' })).toBeTruthy();
    expect(screen.getByLabelText('In space')).toHaveValue(2);
    expect(screen.getByLabelText('In bay')).toHaveValue(3);
    expect(screen.queryByText('Drones')).toBeNull();
  });

  it('is nothing on a hull without a drone bay', () => {
    const { container } = render(
      <DroneSection
        fitting={fitting}
        catalogue={null}
        stats={{ ...stats, droneCapacity: 0, droneBandwidthTotal: 0 }}
        edit={() => {}}
        target={null}
        onSelectTarget={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FittingRackList with the editor’s item actions', () => {
  const names = { 10: 'Autocannon', 11: 'Damage Control', 21: 'Fusion S', 2488: 'Warrior II' };
  const withSlots = {
    ...statsWith(10),
    slotCounts: { high: 3, medium: 0, low: 1, rig: 0, subsystem: 0 },
    droneCapacity: 25,
    droneBandwidthTotal: 25,
  } as FittingStats;

  function renderList(actions: FittingItemActions, fit: Fitting = fitting) {
    return render(
      <MemoryRouter>
        <FittingItemActionsProvider value={actions}>
          <FittingRackList fitting={fit} stats={withSlots} />
        </FittingItemActionsProvider>
      </MemoryRouter>
    );
  }

  it('gives each module row a More actions button with the same menu, Move down included', async () => {
    const actions = fakeItemActions({ names });
    renderList(actions);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for #10' }), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(actions.move).toHaveBeenCalledWith('high', 0, 1);
  });

  it('gives an empty slot the Ring’s empty-slot menu — Paste and Fill rack from its More actions', async () => {
    const actions = fakeItemActions(
      { names },
      { recentFor: () => [10], clipboardFor: (rack) => (rack === 'high' ? 10 : null) }
    );
    renderList(actions);
    const empties = screen.getAllByRole('button', { name: /More actions for Empty/ });
    // High slots 1 and 2 are empty; low has none.
    expect(empties).toHaveLength(2);
    fireEvent.pointerDown(empties[0], { button: 0, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Paste Autocannon' }));
    expect(actions.addModule).toHaveBeenCalledWith('high', 1, 10);
    fireEvent.pointerDown(empties[1], { button: 0, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Fill rack with Autocannon' }));
    expect(actions.fillRack).toHaveBeenCalledWith('high', 10);
  });

  it('opens the empty-slot menu on a right-click of the slot itself', async () => {
    const actions = fakeItemActions({ names });
    renderList(actions);
    fireEvent.contextMenu(screen.getAllByRole('button', { name: /^Empty/ })[0]);
    expect(
      await screen.findByRole('menuitem', { name: 'Paste module (copy one first)' })
    ).toBeTruthy();
  });

  it('takes a charge dropped on a rack heading, loading every module that takes it', () => {
    const actions = fakeItemActions({ names, takes: { 21: ['high-0'] } });
    renderList(actions);
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 21,
      fromCargo: true,
      targets: ['high-0'],
    };
    useFittingDrag.setState({ payload });
    fireEvent.drop(screen.getByText('Low slots'), {
      dataTransfer: { types: [FITTING_DRAG_TYPE], dropEffect: 'none' },
    });
    expect(actions.drop).not.toHaveBeenCalled();
    fireEvent.drop(screen.getByText('High slots'), {
      dataTransfer: { types: [FITTING_DRAG_TYPE], dropEffect: 'none' },
    });
    expect(actions.drop).toHaveBeenCalledWith(payload, { kind: 'rack', rack: 'high' }, undefined);
    useFittingDrag.setState({ payload: null });
  });

  it('launches a drone dragged from the bay onto the Drones rack', () => {
    const actions = fakeItemActions({ names });
    renderList(actions, {
      ...fitting,
      drones: [{ typeId: 2488, quantity: 5, state: 'online' }],
    });
    const payload: FittingDragPayload = { kind: 'drone', typeId: 2488 };
    useFittingDrag.setState({ payload });
    fireEvent.drop(screen.getByText('Drones'), {
      dataTransfer: { types: [FITTING_DRAG_TYPE], dropEffect: 'none' },
    });
    expect(actions.drop).toHaveBeenCalledWith(payload, { kind: 'drones' }, undefined);
    useFittingDrag.setState({ payload: null });
  });

  it('shows the cargo hold against its capacity, and offers Add cargo', () => {
    const actions = fakeItemActions({ names }, { cargoUsed: 520, cargoCapacity: 450 });
    renderList(actions, { ...fitting, cargo: [{ typeId: 21, quantity: 100 }] });
    expect(screen.getByRole('meter', { name: 'Cargo hold (m³)' })).toBeTruthy();
    expect(screen.getByText('Over by 70.0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add cargo' }));
    expect(actions.openAddCargo).toHaveBeenCalled();
  });
});
