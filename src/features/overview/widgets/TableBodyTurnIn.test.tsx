import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { FAILOVER } from '@/features/campaigns/turnInStoryData';
import type { TableModel } from './data/types';
import { TableBody } from './TableBody';

vi.mock('@/features/campaigns/campaignData', () => ({
  loadJoinedObjectives: vi.fn().mockResolvedValue({ kind: 'needsPermission' }),
}));

const table: TableModel = {
  columns: [
    { key: 'objective', label: '', priority: 0 },
    { key: 'who', label: '', priority: 2, grow: true },
    { key: 'filled', label: '', align: 'end', priority: 1 },
  ],
  rows: [
    {
      key: 'turn-in',
      badge: 'Caldari',
      cells: ['Turn in Shield Failover Report', 'You hold 640 · ~37.1M turned in', '17% filled'],
      turnIn: {
        name: 'Shield Failover Report',
        offer: FAILOVER,
        characterId: 7,
        characterName: 'Kestrel Vane',
        surfaceLine: 'You hold 640 · ~37.1M turned in',
      },
    },
    { key: 'joined', badge: 'Minmatar', cells: ['Mine Pyroxeres', 'Kestrel Vane', '41% filled'] },
  ],
};

describe('TableBody turn-in rows', () => {
  it('opens TurnInDetail for the item from the row, never the row modal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TableBody table={table} columnsFor="L" rowLimit={10} ariaLabel="Military campaigns" />
      </MemoryRouter>
    );
    expect(screen.getByText('Caldari')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Turn in Shield Failover Report/ }));
    const popover = await screen.findByRole('dialog', { name: /Shield Failover Report/ });
    expect(popover).toHaveTextContent('You hold 640 · ~37.1M turned in');
    expect(popover).toHaveTextContent('Secure Strength Trader');
  });

  it('draws a row that is no turn-in as plain text: it opens nothing', () => {
    render(
      <MemoryRouter>
        <TableBody table={table} columnsFor="L" rowLimit={10} ariaLabel="Military campaigns" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /Mine Pyroxeres/ })).toBeNull();
  });
});
