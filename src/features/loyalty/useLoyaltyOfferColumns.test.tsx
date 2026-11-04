import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('ISK / LP column', () => {
  const { result } = renderHook(() =>
    useLoyaltyOfferColumns({
      lpBasis: 'lp',
      concord: null,
      concordPending: false,
      isColumnVisible: () => true,
    })
  );
  const column = result.current.optionalColumns.iskPerLp;
  const text = (iskPerLp: number) =>
    render(<>{column.render({ profit: { iskPerLp } } as unknown as LoyaltyOfferRow)}</>).container
      .textContent;

  it('groups thousands instead of printing 88837.4, and is the phone card’s corner figure', () => {
    expect(text(88837.4)).toContain('88,837');
    expect(text(5.25)).toContain('5.3');
    expect(column.cardCorner).toBe(true);
  });
});

describe('phone card (dense stack)', () => {
  it('moves the price from the item cell into a cell of its own on a phone', async () => {
    vi.resetModules();
    vi.doMock('@/lib/useIsPhone', () => ({ useIsPhone: () => true }));
    const { useLoyaltyOfferColumns: usePhone } = await import('./useLoyaltyOfferColumns');
    const { result } = renderHook(() =>
      usePhone({ lpBasis: 'lp', concord: null, concordPending: false, isColumnVisible: () => true })
    );
    expect(result.current.columns.map((c) => c.id)).toEqual([
      'item',
      'cost',
      'sellsPerDay',
      'profit',
      'iskPerLp',
    ]);
    vi.doUnmock('@/lib/useIsPhone');
  });

  it('keeps the table’s columns unchanged off a phone', () => {
    const { result } = renderHook(() =>
      useLoyaltyOfferColumns({
        lpBasis: 'lp',
        concord: null,
        concordPending: false,
        isColumnVisible: () => true,
      })
    );
    expect(result.current.columns.map((c) => c.id)).toEqual([
      'item',
      'sellsPerDay',
      'profit',
      'iskPerLp',
    ]);
  });
});

describe('phone card corner follows the sort', () => {
  const cornerOf = (sortColumnId: string | undefined, visible = true) => {
    const { result } = renderHook(() =>
      useLoyaltyOfferColumns({
        lpBasis: 'lp',
        concord: null,
        concordPending: false,
        isColumnVisible: () => visible,
        sortColumnId,
      })
    );
    return result.current.columns.find((c) => c.cardCorner)?.id;
  };

  it('is the sorted column when it is one of the three, else ISK / LP', () => {
    expect(cornerOf(undefined)).toBe('iskPerLp');
    expect(cornerOf('item')).toBe('iskPerLp');
    expect(cornerOf('profit')).toBe('profit');
    expect(cornerOf('sellsPerDay')).toBe('sellsPerDay');
  });
});

describe('low-volume warning on a phone', () => {
  const lowRow = {
    itemName: 'Small Vorton Projector',
    isBlueprint: false,
    sellsPerDay: 0.2,
    offer: { lp_cost: 100, isk_cost: 0, type_id: 1 },
    profit: {},
  } as unknown as LoyaltyOfferRow;

  async function itemText(isColumnVisible: (id: string) => boolean) {
    vi.resetModules();
    vi.doMock('@/lib/useIsPhone', () => ({ useIsPhone: () => true }));
    const { useLoyaltyOfferColumns: usePhone } = await import('./useLoyaltyOfferColumns');
    const { result } = renderHook(() =>
      usePhone({ lpBasis: 'lp', concord: null, concordPending: false, isColumnVisible })
    );
    const item = result.current.columns[0]!;
    const text = render(<>{item.render(lowRow)}</>).container.textContent;
    vi.doUnmock('@/lib/useIsPhone');
    return text;
  }

  it('leaves the name untagged while the amber sells/day carries it', async () => {
    expect(await itemText(() => true)).not.toContain('lowVolumeTag');
  });

  it('tags the name when the picker hides sells/day, so the warning never vanishes', async () => {
    expect(await itemText((id) => id !== 'sellsPerDay')).toContain('lowVolumeTag');
  });
});
