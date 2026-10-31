import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, VARRO_ID } from './corpBookFixture';
import { MinersTab } from './MinersTab';
import { OverviewTab } from './OverviewTab';

// The Overview and Miners tab print the read models (#5259) and fall back to the whole-book
// view while the docs are missing. The docs here are deliberately unlike the view.
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

const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

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

describe('the Overview and Miners tab read models', () => {
  it("prints a Miner's balance from the miner list doc, and only then", () => {
    const without = renderTab(<MinersTab />, null);
    expect(screen.queryAllByText(/123,456/)).toHaveLength(0);
    without.unmount();
    renderTab(<MinersTab />, VARRO_DOCS);
    expect(screen.getAllByText(/123,456/).length).toBeGreaterThan(0);
  });

  it('prints the Overview from the docs', () => {
    renderTab(<OverviewTab showMoons />);
    expect(headings()).toEqual(['Fractured · 0', 'Ready · 0', 'Pops in the next 7 days · 0']);
    expect(screen.getByText(/Before the book: 7 donations/)).toBeInTheDocument();
  });

  it('falls back to the whole-book view while the docs are missing', () => {
    renderTab(<OverviewTab showMoons />, null);
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
  });

  it('falls back when the docs are from another schema', () => {
    renderTab(<OverviewTab showMoons />, {
      ...DOCS,
      minerList: { ...DOCS.minerList, schema: READ_MODELS_SCHEMA + 1 },
    });
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
  });
});
