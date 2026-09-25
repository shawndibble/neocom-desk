import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingRackList as EditableRackList } from './FittingRackList';

type RackListProps = Parameters<typeof EditableRackList>[0];

/** The read-only props these tests care about; the editing ones get inert defaults. */
function FittingRackList(props: Pick<RackListProps, 'fitting' | 'stats' | 'unusableModuleKeys'>) {
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
