import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { TaxRowMenu } from './TaxRowMenu';

const assignment: MiningTaxAssignmentRecord = {
  id: 'a1',
  characterId: 1,
  date: '2026-09-04',
  solarSystemId: 1,
  payeeId: 'p1',
  oreLines: [],
  taxPct: 10,
  estimatedValue: 1000,
  taxOwed: 100,
  status: 'outstanding',
  updatedAt: 1,
};
const row: MoonMiningTaxRow = {
  characterId: 1,
  characterName: 'Pilot',
  entry: { characterId: 1, date: '2026-09-04', solarSystemId: 1, oreLines: [] },
  assignments: [assignment],
  unassignedOreLines: [],
};
const outstanding: DisplayRow = { key: 'a1', row, assignment, status: 'outstanding' };

function renderMenu(dr: DisplayRow, onAction = vi.fn()) {
  render(
    <table>
      <tbody>
        <TaxRowMenu dr={dr} systemName="Efa" onAction={onAction}>
          <tr data-testid="row">
            <td>cell</td>
          </tr>
        </TaxRowMenu>
      </tbody>
    </table>
  );
  return onAction;
}

describe('TaxRowMenu', () => {
  it('opens on right-click with View details first, then Settle up', async () => {
    renderMenu(outstanding);
    fireEvent.contextMenu(screen.getByTestId('row'));
    const items = await screen.findAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('View details');
    expect(items[1]).toHaveTextContent('Settle up');
    expect(screen.getByRole('menuitem', { name: 'Unassign' })).toBeInTheDocument();
  });

  it('runs the picked action on its row after the menu closes', async () => {
    const onAction = renderMenu(outstanding);
    fireEvent.contextMenu(screen.getByTestId('row'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as paid' }));
    expect(onAction).toHaveBeenCalledWith({ id: 'markPaid' }, outstanding);
  });

  it('renders no menu around a row with nothing but View details', () => {
    const corp = {
      kind: 'row',
      corpName: 'Corp',
      view: { state: 'paid', corporationId: 1 },
    } as unknown as DisplayRow['corp'];
    renderMenu({ ...outstanding, corp, status: 'paid' });
    fireEvent.contextMenu(screen.getByTestId('row'));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
