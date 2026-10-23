import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('TableBody narrow-box rules', () => {
  const model: TableModel = {
    columns: [
      { key: 'item', label: 'Item', priority: 0, nameFloor: true },
      { key: 'price', label: 'Price', align: 'end', priority: 1 },
      { key: 'station', label: 'Station', priority: 2, hideNarrow: true },
    ],
    rows: [{ key: 'a', cells: ['Wyvern', '310M', 'Amarr VIII'] }],
  };

  it('hides a hideNarrow column until the box is wide, header and cell alike', () => {
    renderTable(model);
    expect(screen.getByRole('columnheader', { name: 'Station' })).toHaveClass(
      'hidden',
      '@md:table-cell'
    );
    expect(screen.getByRole('cell', { name: 'Amarr VIII' })).toHaveClass(
      'hidden',
      '@md:table-cell'
    );
    expect(screen.getByRole('cell', { name: '310M' })).not.toHaveClass('hidden');
  });

  it('pads the last cell that shows while the trailing columns are hidden', () => {
    renderTable(model);
    expect(screen.getByRole('cell', { name: '310M' })).toHaveClass('pr-3', '@md:pr-0');
    expect(screen.getByRole('cell', { name: /Wyvern/ })).not.toHaveClass('pr-3');
  });

  it('floors the first column only when it opts in', () => {
    renderTable(model);
    expect(screen.getByRole('cell', { name: /Wyvern/ })).toHaveClass('min-w-28');
    renderTable(table);
    expect(screen.getByRole('cell', { name: /Alpha/ })).not.toHaveClass('min-w-28');
  });
});

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

describe('TableBody grow column', () => {
  const mail: TableModel = {
    columns: [
      { key: 'from', label: 'From', priority: 0 },
      { key: 'age', label: 'Age', align: 'end', priority: 1 },
      { key: 'subject', label: 'Subject', priority: 2, grow: true },
    ],
    rows: [{ key: 'a', cells: ['Bob', '12d ago', 'A very long subject line that would overflow'] }],
  };

  it('truncates the grow column instead of letting it overflow the card', () => {
    renderTable(mail);
    expect(screen.getByRole('cell', { name: /very long subject/ })).toHaveClass(
      'truncate',
      'max-w-0'
    );
    expect(screen.getByRole('cell', { name: 'Bob' })).not.toHaveClass('w-full');
  });

  it('leaves the first column as the truncating one when the grow column is hidden', () => {
    render(
      <MemoryRouter>
        <TableBody table={mail} columnsFor="S" rowLimit={10} ariaLabel="Sample" />
      </MemoryRouter>
    );
    expect(screen.getByRole('cell', { name: 'Bob' })).toHaveClass('w-full');
  });
});

describe('TableBody fitWidth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('drops the low-priority column when the measured box is narrow', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb([{ contentRect: { width: 150 } } as ResizeObserverEntry], this as never);
        }
        unobserve() {}
        disconnect() {}
      }
    );
    renderTable({ ...table, fitWidth: true });
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
  });
});
