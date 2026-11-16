import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { TableModel } from './data/types';
import { TableBody } from './TableBody';

const table: TableModel = {
  columns: [
    { key: 'item', label: 'Item' },
    { key: 'target', label: 'Target', align: 'end' },
  ],
  rows: [
    {
      key: 'plex',
      cells: ['PLEX', { text: '≤ 1.2M', iskAmount: 1_234_567, prefix: '≤' }],
    },
  ],
};

describe('TableBody ISK cell', () => {
  it('draws a prefixed ISK figure as its word, the shorthand, and the exact value as text', () => {
    render(
      <MemoryRouter>
        <TableBody table={table} columnsFor="L" rowLimit={3} ariaLabel="Sample" />
      </MemoryRouter>
    );
    const cell = screen.getByText('1.2M', { exact: false }).closest('td')!;
    expect(cell.textContent).toBe('≤ 1.2M 1,234,567 ISK');
  });
});
