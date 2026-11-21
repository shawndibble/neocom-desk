import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, VARRO_ID } from './corpBookFixture';
import { MinersTab } from './MinersTab';
import { OverviewTab } from './OverviewTab';

// The Overview and Miners tab printed the read models (#5259). The docs here are deliberately
// unlike the view, so a tab still reading them would show.
vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(), readAudit: vi.fn() }));
vi.mock('@/features/corpTaxBook/mailQueueStore', () => ({
  listQueue: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

const DOCS = {
  minerList: { schema: READ_MODELS_SCHEMA, miners: [] },
  overview: {
    schema: READ_MODELS_SCHEMA,
    donationsBeforeBook: 7,
    unmatchedPayments: [],
    extractions: [],
  },
};

function renderTab(ui: React.ReactElement, readModels: unknown = DOCS) {
  const value = {
    ...BOOK_CONTEXT,
    data: { ...(BOOK_CONTEXT.data as object), ...(readModels ? { readModels } : {}) },
  } as typeof BOOK_CONTEXT;
  return render(
    <MemoryRouter initialEntries={['/corp/moons']}>
      <BookProvider value={value}>{ui}</BookProvider>
    </MemoryRouter>
  );
}

/** The schedule panel's group headings (the Overview has other h3s, e.g. Overdue by age). */
const headings = () =>
  within(screen.getByRole('heading', { level: 2, name: 'Moons' }).closest('section')!)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

const VARRO_DOCS = {
  ...DOCS,
  minerList: {
    schema: READ_MODELS_SCHEMA,
    miners: [
      {
        minerId: VARRO_ID,
        owed: 123_456,
        credit: 0,
        lastPaidAt: null,
        unsettled: [],
        unresolvedDeclarations: [],
      },
    ],
  },
};

describe('the Overview and Miners tabs, with read model docs still stored', () => {
  // The read models counted calendar Statements (decision 20261120-235011): the tabs read every
  // Miner off their Running account, whatever docs an older server left.
  it("prints a Miner's balance from their Running account, not the miner list doc", () => {
    renderTab(<MinersTab />, VARRO_DOCS);
    expect(screen.queryAllByText(/123,456/)).toHaveLength(0);
  });

  it('prints the Overview from the whole-book view', () => {
    renderTab(<OverviewTab />);
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
    expect(screen.queryByText(/Before the book: 7 donations/)).not.toBeInTheDocument();
  });
});
