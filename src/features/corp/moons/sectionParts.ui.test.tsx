import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { BookSection } from './sectionParts';

interface Row {
  id: string;
  amount: number;
}
// 12 rows: the largest amounts sit at the end, past the first page of ten.
const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i + 1}`, amount: i + 1 }));
const columns: DataTableColumn<Row>[] = [
  { id: 'id', header: 'Id', primary: true, render: (r) => r.id },
  { id: 'amount', header: 'Amount', render: (r) => r.amount, sortValue: (r) => r.amount },
];

function renderSection() {
  return render(
    <BookSection title="Things" noun="things" rows={rows} sortColumns={columns} phone={false}>
      {(shown, table) => (
        <DataTable
          label="Things"
          columns={columns}
          rows={[...shown]}
          rowKey={(r) => r.id}
          {...table}
        />
      )}
    </BookSection>
  );
}

const ids = () =>
  within(screen.getByRole('table', { name: 'Things' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);

describe('BookSection paging', () => {
  it('shows the first ten and counts all twelve in the title', () => {
    renderSection();
    expect(screen.getByText('Things · 12')).toBeInTheDocument();
    expect(ids()).toHaveLength(10);
    expect(screen.queryByText('No older things.')).not.toBeInTheDocument();
  });

  it('sorts the whole list before paging, so the biggest of the older rows leads', async () => {
    renderSection();
    const amount = screen.getByRole('button', { name: /Amount/ });
    await userEvent.click(amount);
    await userEvent.click(amount);
    expect(ids()[0]).toBe('r12');
    expect(ids()).toHaveLength(10);
  });

  it('Load older adds the rest, then says there is nothing older', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /Load older things \(2 more\)/ }));
    expect(ids()).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /Load older/ })).not.toBeInTheDocument();
    expect(screen.getByText('No older things.')).toBeInTheDocument();
  });
});
