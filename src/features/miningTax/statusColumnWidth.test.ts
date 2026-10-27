import { describe, expect, it } from 'vitest';
import { statusColumnWidthClass } from './statusColumnWidth';

const pills = (...texts: string[]) => texts.map((text) => ({ text }));

describe('statusColumnWidthClass', () => {
  it('floors at the header: a table of Paid rows is no narrower than "Status" and its sort arrow', () => {
    expect(statusColumnWidthClass(pills('Paid', 'Paid'))).toBe('sm:w-24');
    expect(statusColumnWidthClass([])).toBe('sm:w-24');
  });

  it('widens for the longest text shown, not the commonest', () => {
    expect(statusColumnWidthClass(pills('Paid', 'Dismissed'))).toBe('sm:w-28');
    expect(statusColumnWidthClass(pills('Paid', 'Outstanding'))).toBe('sm:w-32');
    expect(statusColumnWidthClass(pills('Unassigned'))).toBe('sm:w-32');
    expect(statusColumnWidthClass(pills('Needs Review'))).toBe('sm:w-36');
  });

  it('fits the long corp-book pills, which print on one line', () => {
    expect(statusColumnWidthClass(pills('Dismissed by corp'))).toBe('sm:w-44');
    expect(statusColumnWidthClass(pills('Pending corp record'))).toBe('sm:w-48');
  });

  it('leaves room for the overlap mark only on the pill that carries it', () => {
    expect(statusColumnWidthClass([{ text: 'Paid', marked: true }])).toBe('sm:w-24');
    expect(statusColumnWidthClass([{ text: 'Dismissed', marked: true }])).toBe('sm:w-32');
    expect(statusColumnWidthClass([{ text: 'Dismissed' }, { text: 'Paid', marked: true }])).toBe(
      'sm:w-28'
    );
  });
});
