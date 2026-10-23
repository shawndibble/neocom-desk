import { describe, expect, it } from 'vitest';
import { statusColumnWidthClass } from './statusColumnWidth';

describe('statusColumnWidthClass', () => {
  it('floors at the header: a table of Paid rows is no narrower than "Status" and its sort arrow', () => {
    expect(statusColumnWidthClass(['Paid', 'Paid'])).toBe('sm:w-24');
    expect(statusColumnWidthClass([])).toBe('sm:w-24');
  });

  it('widens for the longest label shown, not the commonest', () => {
    expect(statusColumnWidthClass(['Paid', 'Dismissed'])).toBe('sm:w-28');
    expect(statusColumnWidthClass(['Paid', 'Outstanding'])).toBe('sm:w-32');
    expect(statusColumnWidthClass(['Unassigned'])).toBe('sm:w-32');
    expect(statusColumnWidthClass(['Needs Review'])).toBe('sm:w-36');
  });

  it('leaves room for the overlap mark a corp pill can carry', () => {
    expect(statusColumnWidthClass(['Paid'], { markedLabels: ['Paid'] })).toBe('sm:w-24');
    expect(statusColumnWidthClass(['Dismissed'], { markedLabels: ['Dismissed'] })).toBe('sm:w-32');
  });
});
