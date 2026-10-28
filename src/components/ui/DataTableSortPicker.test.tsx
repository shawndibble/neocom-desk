import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DataTableSortPicker } from './DataTableSortPicker';
import type { DataTableColumn } from './DataTable';

interface Row {
  name: string;
  price: number;
}
const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  { id: 'price', header: 'Price', render: (r) => r.price, sortValue: (r) => r.price },
  { id: 'note', header: 'Note', render: () => '' },
];
const rows: Row[] = [{ name: 'a', price: 1 }];

describe('DataTableSortPicker iconOnly', () => {
  it('shows no text label, names the sort in force, lists every option', () => {
    render(
      <DataTableSortPicker
        iconOnly
        columns={columns}
        rows={rows}
        sort={{ columnId: 'price', direction: 'desc' }}
        onSortChange={() => {}}
      />
    );
    const select = screen.getByRole('combobox', { name: /^Sort by, now Sort: Price/ });
    // Only the native options carry text; the visible box is the icon alone.
    expect(select.parentElement?.querySelector('span')).toBeNull();
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value)
    ).toEqual(['', 'name:asc', 'name:desc', 'price:desc', 'price:asc']);
  });

  it('calls onSortChange with the picked option', async () => {
    const onSortChange = vi.fn();
    render(
      <DataTableSortPicker
        iconOnly
        columns={columns}
        rows={rows}
        sort={undefined}
        onSortChange={onSortChange}
      />
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'name:desc');
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'desc' });
  });
});
