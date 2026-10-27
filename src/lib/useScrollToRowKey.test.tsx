import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollToRowKey } from './useScrollToRowKey';

interface Row {
  id: number;
}

function TestList({ rowKey, rows }: { rowKey: number | null; rows: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollToRowKey(ref, rowKey, rows);
  return (
    <div ref={ref}>
      {rows.map((row) => (
        <div key={row.id} data-row-key={row.id}>
          {row.id}
        </div>
      ))}
    </div>
  );
}

describe('useScrollToRowKey a11y', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the matched row aria-current and moves focus to it', () => {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const rows = [{ id: 1 }, { id: 2 }];
    render(<TestList rowKey={2} rows={rows} />);

    const target = document.querySelector('[data-row-key="2"]');
    expect(target).toHaveAttribute('aria-current', 'location');
    expect(target).toHaveFocus();
    expect(document.querySelector('[data-row-key="1"]')).not.toHaveAttribute('aria-current');
  });

  it('does not steal focus back on every re-render of the same key', () => {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const rows = [{ id: 1 }, { id: 2 }];
    const { rerender } = render(<TestList rowKey={2} rows={rows} />);

    const target = document.querySelector('[data-row-key="2"]') as HTMLElement;
    (document.activeElement as HTMLElement | null)?.blur();
    expect(target).not.toHaveFocus();

    rerender(<TestList rowKey={2} rows={rows} />);
    expect(target).not.toHaveFocus();
  });

  it('moves aria-current off the old row when the key changes', () => {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const rows = [{ id: 1 }, { id: 2 }];
    const { rerender } = render(<TestList rowKey={1} rows={rows} />);
    expect(document.querySelector('[data-row-key="1"]')).toHaveAttribute(
      'aria-current',
      'location'
    );

    rerender(<TestList rowKey={2} rows={rows} />);
    expect(document.querySelector('[data-row-key="1"]')).not.toHaveAttribute('aria-current');
    expect(document.querySelector('[data-row-key="2"]')).toHaveAttribute(
      'aria-current',
      'location'
    );
  });

  it('does nothing for a key matching no row', () => {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const rows = [{ id: 1 }];
    render(<TestList rowKey={999} rows={rows} />);
    expect(document.querySelector('[aria-current]')).toBeNull();
  });
});
