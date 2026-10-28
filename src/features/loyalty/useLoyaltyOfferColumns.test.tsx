import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLoyaltyOfferColumns } from './useLoyaltyOfferColumns';
import type { LoyaltyOfferRow } from './offerRows';

const row = (sellsPerDay: number | null) => ({ sellsPerDay }) as unknown as LoyaltyOfferRow;

describe('Sells/day column (issue #5127)', () => {
  const { result } = renderHook(() =>
    useLoyaltyOfferColumns({
      lpBasis: 'lp',
      concord: null,
      concordPending: false,
      isColumnVisible: () => true,
    })
  );
  const column = result.current.optionalColumns.sellsPerDay;
  const text = (value: number | null) =>
    render(<>{column.render(row(value))}</>).container.textContent;

  it('shows whole units from ten up, one decimal below, the none label for a real zero and a dash when unavailable', () => {
    expect(text(1234.4)).toBe('1,234');
    expect(text(3.25)).toBe('3.3');
    expect(text(0)).toBe('loyaltyStore.sellsNone');
    expect(text(null)).toBe('—');
  });

  it('sorts unavailable apart from none', () => {
    expect(column.sortValue?.(row(0))).toBe(0);
    expect(column.sortValue?.(row(null))).toBeUndefined();
  });
});

describe('Item column in a windowed table (issue #5388)', () => {
  const { result } = renderHook(() =>
    useLoyaltyOfferColumns({
      lpBasis: 'lp',
      concord: null,
      concordPending: false,
      isColumnVisible: () => true,
    })
  );

  it('is the one width-less column, with its own floor, so a fixed layout cannot squeeze it', () => {
    const [item, ...rest] = result.current.columns;
    expect(item.width).toBeUndefined();
    expect(item.minWidth).toBe('14rem');
    expect(item.className).toBeUndefined();
    expect(rest.every((column) => column.width)).toBe(true);
  });
});
