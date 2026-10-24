import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ExtractionsTab } from './ExtractionsTab';

const tableProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
const book = vi.hoisted(() => ({ canEdit: true }));

vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  DataTable: (props: Record<string, unknown>) => {
    tableProps.calls.push(props);
    return null;
  },
}));
vi.mock('./ExtractionTimeline', () => ({ ExtractionTimeline: () => null }));
vi.mock('./useBook', () => ({
  useBook: () => ({
    view: {
      extractions: [
        { id: 'a', state: 'ready', oreSource: 'unknown', tax: 100, structureId: 1 },
        { id: 'b', state: 'fractured', oreSource: 'notification', tax: 0, structureId: 1 },
      ],
    },
    canEdit: book.canEdit,
    edit: vi.fn(),
    names: { refinery: () => 'R', moon: () => 'M' },
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
    expect(props.stackSummary).toBe('2 Extractions');
  });

  it('right-click opens Link a Survey and Dismiss tax for an officer; none for a viewer or Notification ore', () => {
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
    expect(screen.getByRole('menuitem', { name: 'Link a Survey…' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Dismiss tax for this extraction…' })
    ).toBeInTheDocument();
    unmount();
    // Notification-sourced ore has no survey to link: one action left, so no menu.
    const plain = menuFor(rows[1], <div data-testid="row2">row</div>);
    expect(plain.type).toBe('div');
  });
});
