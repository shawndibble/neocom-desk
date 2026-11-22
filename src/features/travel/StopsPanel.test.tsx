import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { StopsPanel } from './StopsPanel';

const stops = [
  { systemId: 1, stationId: null },
  { systemId: 2, stationId: null },
  { systemId: 3, stationId: null },
];

function renderPanel() {
  const onStopsChange = vi.fn();
  render(
    <MemoryRouter>
      <StopsPanel
        fromId={9}
        fromName="Start"
        fromTrigger="Start"
        onFromChange={vi.fn()}
        stops={stops}
        onStopsChange={onStopsChange}
        settings={{ optimize: false, returnToStart: false, keepLastStopLast: false }}
        onSettingsChange={vi.fn()}
        optimizeBlocked={false}
        orderNote={null}
        nameOf={(id) => `Sys ${id}`}
      />
    </MemoryRouter>
  );
  return onStopsChange;
}

describe('StopsPanel reorder without dragging', () => {
  it('Move up / Move down in the row menu reorder the stops, absent at the ends', async () => {
    const user = userEvent.setup();
    const onStopsChange = renderPanel();
    await user.click(screen.getByRole('button', { name: 'More actions for Sys 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(onStopsChange).toHaveBeenLastCalledWith([stops[1], stops[0], stops[2]]);
    await user.click(screen.getByRole('button', { name: 'More actions for Sys 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(onStopsChange).toHaveBeenLastCalledWith([stops[0], stops[2], stops[1]]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'More actions for Sys 1' }));
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onStopsChange).toHaveBeenLastCalledWith([stops[1], stops[2]]);
  });
});
