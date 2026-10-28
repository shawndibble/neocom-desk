import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: number;
  item: string;
}

const rows: Row[] = [
  { id: 1, item: 'Tritanium' },
  { id: 2, item: 'Pyerite' },
];
const columns: DataTableColumn<Row>[] = [
  {
    id: 'item',
    header: 'Item',
    stickyStart: true,
    sortValue: (row) => row.item,
    render: (r) => r.item,
  },
];

const realMatchMedia = window.matchMedia;
const realRect = HTMLElement.prototype.getBoundingClientRect;

function phone(matches: boolean) {
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: matches && media === PHONE_QUERY,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** The real header scrolled 50px above the viewport, 400px of rows left. */
function headerScrolledAway() {
  HTMLElement.prototype.getBoundingClientRect = function () {
    const rect = (top: number, height: number) =>
      ({ top, height, bottom: top + height, left: 0, right: 300, width: 300 }) as DOMRect;
    if (this.tagName === 'THEAD') return rect(-50, 30);
    if (this.tagName === 'TABLE') return rect(-50, 450);
    return rect(0, 0);
  };
}

describe('DataTable sticky header on a phone', () => {
  beforeEach(headerScrolledAway);
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLElement.prototype.getBoundingClientRect = realRect;
    document.documentElement.style.scrollPaddingTop = '';
  });

  it('pins a copy of the header of a table-mode table once the real one scrolls away', () => {
    phone(true);
    render(
      <DataTable
        label="Items"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        responsive="table"
      />
    );
    const copy = screen.getByTestId('dt-sticky-header');
    expect(copy).toHaveAttribute('aria-hidden', 'true');
    expect(copy).toHaveTextContent('Item');
    // Not in the tab order, so only the real header is reachable by keyboard.
    expect(copy.querySelector('button')).toHaveAttribute('tabindex', '-1');
  });

  it('reserves the header height so a focused row clears the copy', () => {
    phone(true);
    render(
      <DataTable
        label="Items"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        responsive="table"
      />
    );
    expect(document.documentElement.style.scrollPaddingTop).toBe('30px');
  });

  it('adds nothing to a stacked table: cards have no header row', () => {
    phone(true);
    render(<DataTable label="Items" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.queryByTestId('dt-sticky-header')).toBeNull();
  });

  it('adds nothing at desktop width', () => {
    phone(false);
    render(
      <DataTable
        label="Items"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        responsive="table"
      />
    );
    expect(screen.queryByTestId('dt-sticky-header')).toBeNull();
  });

  it('adds nothing while the real header is still in view', () => {
    phone(true);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      height: 30,
      bottom: 500,
      left: 0,
      right: 300,
      width: 300,
    } as DOMRect);
    render(
      <DataTable
        label="Items"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        responsive="table"
      />
    );
    expect(screen.queryByTestId('dt-sticky-header')).toBeNull();
  });

  it('lays a translucent panel fill over the page colour so rows do not show through', () => {
    phone(true);
    render(
      <div style={{ backgroundColor: 'rgba(10, 20, 30, 0.85)' }}>
        <DataTable
          label="Items"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          responsive="table"
        />
      </div>
    );
    const background = screen.getByTestId('dt-sticky-header').style.background;
    expect(background).toContain('linear-gradient');
    expect(background).toContain('var(--color-bg)');
  });
});
