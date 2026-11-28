import { describe, expect, it } from 'vitest';
import { fitColumnWidth } from './transactionColumnWidths';

describe('fitColumnWidth', () => {
  it('sizes to the widest value plus the sort gutter', () => {
    expect(fitColumnWidth([3, 9, 5], 'Qty')).toBe('11.5ch');
  });

  it('never goes below the header plus its sort arrow', () => {
    expect(fitColumnWidth([1, 3], 'Quantity')).toBe('13ch');
  });

  it('floors an empty column at the header', () => {
    expect(fitColumnWidth([], 'Total')).toBe('9ch');
  });
});
