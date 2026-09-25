import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingRing } from './FittingRing';
import { resolveFittingView } from './fittingViewPreference';

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
