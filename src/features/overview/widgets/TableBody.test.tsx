import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { TableModel } from './data/types';
import { TableBody } from './TableBody';

const table: TableModel = {
  columns: [
    { key: 'name', label: 'Name', priority: 0 },
    { key: 'change', label: 'Change', align: 'end', priority: 1 },
    { key: 'done', label: 'Done', align: 'end', priority: 2 },
  ],
  rows: [
    {
      key: 'a',
      cells: ['Alpha', { text: '+5M', tone: 'good' }, { text: '40%', bar: 0.4 }],
    },
    { key: 'b', cells: ['Beta', { text: '-2M', tone: 'bad' }, '0%'] },
    { key: 'c', cells: ['Gamma', { text: '0.4', tone: 'caution' }, '9%'] },
  ],
};

const renderTable = (model: TableModel = table) =>
  render(
    <MemoryRouter>
      <TableBody table={model} columnsFor="L" rowLimit={10} ariaLabel="Sample" />
    </MemoryRouter>
  );

describe('TableBody cell tone and bar', () => {
  it('keeps the text next to the tone and the bar, so colour is never the only signal', () => {
    renderTable();
    expect(screen.getByRole('cell', { name: '+5M' })).toHaveClass('text-success');
    expect(screen.getByRole('cell', { name: '-2M' })).toHaveClass('text-danger');
    expect(screen.getByRole('cell', { name: '40%' })).toBeInTheDocument();
  });

  it('draws the bar for a bar cell only, hidden from assistive tech, at its fraction', () => {
    const { container } = renderTable();
    const bars = container.querySelectorAll('[aria-hidden="true"] > [style]');
    expect(bars).toHaveLength(1);
    expect((bars[0] as HTMLElement).style.width).toBe('40%');
  });

  it('adds the tone as a hidden word to an unsigned cell, and not to a signed one', () => {
    renderTable();
    expect(screen.getByRole('cell', { name: '0.4 caution' })).toHaveClass('text-warning');
    expect(screen.getByRole('cell', { name: '+5M' })).toBeInTheDocument();
  });

  it('names the table and makes the first cell a row header when there is no header row', () => {
    renderTable({
      columns: [
        { key: 'name', label: '', priority: 0 },
        { key: 'v', label: '', align: 'end', priority: 1 },
      ],
      rows: [{ key: 'a', cells: ['Alpha', '5'] }],
    });
    expect(screen.getByRole('table', { name: 'Sample' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Alpha' })).toBeInTheDocument();
  });
});
