import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, VARRO_ID } from './corpBookFixture';
import { MinersTab } from './MinersTab';
import { OverviewTab } from './OverviewTab';

// The switch (#5259, readModelSwitch.ts): off, the tabs print the whole-book view whatever the
// docs say; on, they print the docs. The docs here are deliberately unlike the view.
const flag = vi.hoisted(() => ({ on: false }));
vi.mock('../taxBook/readModelSwitch', () => ({
  get CORP_BOOK_READ_MODELS() {
    return flag.on;
  },
  CORP_BOOK_MINER_SCOPED_READ: false,
}));
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

describe('CORP_BOOK_READ_MODELS off', () => {
  it('prints the whole-book view and ignores the docs', () => {
    flag.on = false;
    renderTab(<OverviewTab showMoons />);
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
    expect(screen.queryByText(/Before the book/)).not.toBeInTheDocument();
  });

  it('lists the same Miners on the Miners tab with or without docs', () => {
    flag.on = false;
    const { unmount } = renderTab(<MinersTab />, undefined);
    const without = screen.getAllByRole('row').length;
    expect(without).toBeGreaterThan(1);
    unmount();
    renderTab(<MinersTab />);
    expect(screen.getAllByRole('row')).toHaveLength(without);
  });
});

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

describe('CORP_BOOK_READ_MODELS on', () => {
  it("prints a Miner's balance from the miner list doc, and only then", () => {
    flag.on = false;
    const off = renderTab(<MinersTab />, VARRO_DOCS);
    expect(screen.queryAllByText(/123,456/)).toHaveLength(0);
    off.unmount();
    flag.on = true;
    renderTab(<MinersTab />, VARRO_DOCS);
    expect(screen.getAllByText(/123,456/).length).toBeGreaterThan(0);
  });

  it('prints the Overview from the docs', () => {
    flag.on = true;
    renderTab(<OverviewTab showMoons />);
    expect(headings()).toEqual(['Fractured · 0', 'Ready · 0', 'Pops in the next 7 days · 0']);
    expect(screen.getByText(/Before the book: 7 donations/)).toBeInTheDocument();
  });

  it('falls back to the whole-book view while the docs are missing', () => {
    flag.on = true;
    renderTab(<OverviewTab showMoons />, null);
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
  });

  it('falls back when the docs are from another schema', () => {
    flag.on = true;
    renderTab(<OverviewTab showMoons />, {
      ...DOCS,
      minerList: { ...DOCS.minerList, schema: READ_MODELS_SCHEMA + 1 },
    });
    expect(headings()).toEqual(['Fractured · 1', 'Ready · 1', 'Pops in the next 7 days · 1']);
  });
});
