import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ExtractionsTab } from './ExtractionsTab';

const tableProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
const book = vi.hoisted(() => ({ canEdit: true, rows: null as unknown[] | null }));

const real = vi.hoisted(() => ({ table: false }));

vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return {
    ...actual,
    DataTable: (props: Record<string, unknown>) => {
      if (real.table) return (actual.DataTable as (p: unknown) => ReactElement)(props);
      tableProps.calls.push(props);
      return null;
    },
  };
});
vi.mock('./ExtractionTimeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ExtractionTimeline')>()),
  ExtractionTimeline: ({ filter }: { filter?: React.ReactNode }) => <>{filter}</>,
}));
vi.mock('./LinkSurveyDialog', () => ({ LinkSurveyDialog: () => <div>link survey dialog</div> }));
vi.mock('./BookDialogs', () => ({
  ReasonDialog: ({ title }: { title: string }) => <div>{`reason dialog: ${title}`}</div>,
}));
const ex = (id: string, oreSource: string, tax: number) => ({
  id,
  state: 'ready',
  oreSource,
  tax,
  structureId: 1,
  moonId: 1,
  startedAt: '2026-09-01T00:00:00Z',
  chunkArrivalAt: '2026-09-02T00:00:00Z',
  oreLines: [],
  estimatedValue: null,
  minedPct: null,
  minerCount: 0,
});
vi.mock('./useBook', () => ({
  useBook: () => ({
    corporationId: 98000001,
    view: {
      extractions: book.rows ?? [
        ex('a', 'survey', 100),
        ex('b', 'unknown', 0),
        ex('c', 'survey', 0),
        ex('d', 'notification', 50),
        { ...ex('e', 'survey', 0), state: 'expired' },
      ],
    },
    canEdit: book.canEdit,
    edit: vi.fn(),
    names: {
      refinery: () => 'R',
      moon: () => 'M',
      ore: () => 'Ore',
      corporation: (id: number) => `Corp ${id}`,
    },
  }),
}));

describe('ExtractionsTab on a phone', () => {
  it('offers the sort control with a count summary and pairs the card facts two per line', () => {
    render(
      <MemoryRouter>
        <ExtractionsTab />
      </MemoryRouter>
    );
    const props = tableProps.calls[0];
    expect(props.mobileSort).toBe(true);
    expect(props.stackColumns).toBe(2);
    expect(props.stackSummary).toBe('5 Extractions');
  });

  it('lists the states the chips have on, Expired included by default, and counts what each adds', async () => {
    render(
      <MemoryRouter>
        <ExtractionsTab />
      </MemoryRouter>
    );
    expect(tableProps.calls.at(-1)!.stackSummary).toBe('5 Extractions');
    const expired = screen.getByRole('button', { name: /Expired/ });
    expect(expired).toHaveTextContent('1');
    await userEvent.click(expired);
    expect(tableProps.calls.at(-1)!.stackSummary).toBe('4 Extractions');
  });

  it('right-click menu: both items on a surveyed row with tax; no menu otherwise', () => {
    render(
      <MemoryRouter>
        <ExtractionsTab />
      </MemoryRouter>
    );
    const props = tableProps.calls.at(-1)!;
    const menuFor = props.rowContextMenu as (row: unknown, tr: ReactElement) => ReactElement;
    const rows = props.rows as { id: string }[];
    const { unmount } = render(
      <MemoryRouter>{menuFor(rows[0], <div data-testid="row">row</div>)}</MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByTestId('row'));
    expect(screen.getByRole('menuitem', { name: 'Change survey' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Dismiss tax for this extraction' })
    ).toBeInTheDocument();
    unmount();
    // Unknown ore (the visible Link button), zero tax (inert Dismiss), Notification ore: no menu.
    for (const row of rows.slice(1)) {
      expect(menuFor(row, <div>row</div>).type).toBe('div');
    }
  });

  it('keeps the trailing caret on rows without a menu, and drops it where the ⋮ is', () => {
    render(
      <MemoryRouter>
        <ExtractionsTab />
      </MemoryRouter>
    );
    const props = tableProps.calls.at(-1)!;
    const go = (props.columns as { id: string; render: (row: unknown) => unknown }[]).find(
      (column) => column.id === 'go'
    )!;
    const rows = props.rows as unknown[];
    expect(go.render(rows[0])).toBeNull();
    expect(go.render(rows[1])).not.toBeNull();
  });
});

describe('ExtractionsTab with moon owners (#6097)', () => {
  const shown = (rows: unknown[]) => {
    real.table = true;
    book.rows = rows;
    try {
      render(
        <MemoryRouter>
          <ExtractionsTab />
        </MemoryRouter>
      );
    } finally {
      real.table = false;
      book.rows = null;
    }
  };

  it('lists a moon owner’s coming chunk with its corporation named, in a book with no refinery of its own', () => {
    shown([{ ...ex('m', 'unknown', 0), state: 'extracting', sourceCorporationId: 98000002 }]);
    const row = screen.getByText('Corp 98000002').closest('tr');
    expect(row).toHaveTextContent('Extracting');
    // No notification is read for a moon owner: without a linked Survey the ore is unknown.
    expect(row).toHaveTextContent('Ore unknown');
  });

  it('names the book’s own corporation beside a moon owner’s, and none when every chunk is its own', () => {
    shown([{ ...ex('m', 'unknown', 0), sourceCorporationId: 98000002 }, ex('o', 'unknown', 0)]);
    expect(screen.getByText('Corp 98000002')).toBeInTheDocument();
    expect(screen.getByText('Corp 98000001')).toBeInTheDocument();
    cleanup();
    shown([ex('o', 'unknown', 0)]);
    expect(screen.queryByText(/^Corp /)).not.toBeInTheDocument();
  });
});

describe('ExtractionsTab ⋮', () => {
  it('opens the survey and dismiss dialogs from the ⋮ button', async () => {
    real.table = true;
    try {
      render(
        <MemoryRouter>
          <ExtractionsTab />
        </MemoryRouter>
      );
      // Only the surveyed row with tax carries a ⋮.
      const more = screen.getAllByRole('button', { name: /More actions for/ });
      expect(more).toHaveLength(1);
      await userEvent.click(more[0]!);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Change survey' }));
      expect(await screen.findByText('link survey dialog')).toBeInTheDocument();
      await userEvent.click(screen.getAllByRole('button', { name: /More actions for/ })[0]!);
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Dismiss tax for this extraction' })
      );
      expect(await screen.findByText(/reason dialog/)).toBeInTheDocument();
    } finally {
      real.table = false;
    }
  });
});
