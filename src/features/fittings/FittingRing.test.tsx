import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingRing } from './FittingRing';
import { FITTING_DRAG_TYPE, useFittingDrag, type FittingDragPayload } from './fittingDrag';
import { resolveFittingView } from './fittingViewPreference';

/** A drop carrying this app's marker, with `payload` as the drag in progress. */
function dropWith(payload: FittingDragPayload) {
  useFittingDrag.setState({ payload });
  return { dataTransfer: { types: [FITTING_DRAG_TYPE], dropEffect: 'none' } };
}

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 10, state: 'active', chargeTypeId: 20 },
    { slot: 'low', slotIndex: 0, typeId: 11, state: 'online' },
  ],
  drones: [],
  cargo: [],
};

function statsWith(cpuUsed: number): FittingStats {
  return {
    cpuUsed,
    cpuTotal: 100,
    powergridUsed: 10,
    powergridTotal: 100,
    slotCounts: { high: 3, medium: 2, low: 1, rig: 0, subsystem: 5 },
  } as FittingStats;
}

describe('FittingRing', () => {
  it('draws every slot the hull has, empty ones and subsystems included', () => {
    render(<FittingRing fitting={fitting} stats={statsWith(10)} />);
    expect(screen.getAllByLabelText(/^High slots \d/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Mid slots \d/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/^Subsystems \d/)).toHaveLength(5);
    expect(screen.getAllByLabelText(/empty$/)).toHaveLength(3 - 1 + 2 + 0 + 5);
  });

  it('reports the slot tapped', () => {
    const onSlotSelect = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onSlotSelect={onSlotSelect} />);
    fireEvent.click(screen.getByLabelText('High slots 2, empty'));
    expect(onSlotSelect).toHaveBeenCalledWith('high', 1);
  });

  it('fits an Add panel item dropped on a slot of its rack, and refuses another rack’s', () => {
    const onDropType = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onDropType={onDropType} />);
    const empty = screen.getByLabelText('High slots 2, empty');

    fireEvent.drop(
      screen.getByLabelText('Mid slots 1, empty'),
      dropWith({ kind: 'type', typeId: 99, rack: 'high' })
    );
    expect(onDropType).not.toHaveBeenCalled();

    fireEvent.drop(empty, dropWith({ kind: 'type', typeId: 99, rack: 'high' }));
    expect(onDropType).toHaveBeenCalledWith('high', 1, 99);
    expect(useFittingDrag.getState().payload).toBeNull();
  });

  it('moves a fitted module dragged along its rack', () => {
    const onMoveModule = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onMoveModule={onMoveModule} />);
    fireEvent.drop(
      screen.getByLabelText('High slots 3, empty'),
      dropWith({ kind: 'slot', rack: 'high', index: 0 })
    );
    expect(onMoveModule).toHaveBeenCalledWith('high', 0, 2);
  });

  it('ignores a drop from outside the app', () => {
    const onDropType = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onDropType={onDropType} />);
    useFittingDrag.setState({ payload: { kind: 'type', typeId: 99, rack: 'high' } });
    fireEvent.drop(screen.getByLabelText('High slots 2, empty'), {
      dataTransfer: { types: ['text/plain'] },
    });
    expect(onDropType).not.toHaveBeenCalled();
    useFittingDrag.setState({ payload: null });
  });

  it('on the phone overview, edits through the rack buttons and not the tiles', () => {
    const onSlotSelect = vi.fn();
    const onRackOpen = vi.fn();
    render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        compact
        onSlotSelect={onSlotSelect}
        onRackOpen={onRackOpen}
      />
    );
    fireEvent.click(screen.getByLabelText('High slots 2, empty'));
    expect(onSlotSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^High slots\s*1 \/ 3$/ }));
    expect(onRackOpen).toHaveBeenCalledWith('high');
    // No corner readouts on the overview — the List bars carry those numbers.
    expect(screen.queryByRole('meter', { name: 'CPU' })).toBeNull();
  });

  it('states the overage in words and flashes the readout once when over budget', () => {
    const { rerender, container } = render(<FittingRing fitting={fitting} stats={statsWith(90)} />);
    expect(screen.queryByText(/Over by/)).toBeNull();

    rerender(<FittingRing fitting={fitting} stats={statsWith(112.5)} />);
    expect(screen.getByText('Over by 12.5')).toBeTruthy();
    expect(container.querySelectorAll('.flash-danger')).toHaveLength(1);
    expect(container.querySelector('path.stroke-danger')).not.toBeNull();
  });
});

describe('resolveFittingView', () => {
  it('defaults by breakpoint when nothing is stored, and honours a stored choice', () => {
    expect(resolveFittingView(null, false)).toBe('ring');
    expect(resolveFittingView(null, true)).toBe('list');
    expect(resolveFittingView('ring', true)).toBe('ring');
    expect(resolveFittingView('list', false)).toBe('list');
  });
});
