import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { parseIskAmount } from '@/lib/isk';
import type { Translate } from '@/lib/translate';
import {
  activeDateRangeFilters,
  activeFilterText,
  boundText,
  clearFilters,
  summarizeFilterValues,
  type ActiveFilter,
} from './activeFilters';

const t: Translate = (key, opts) => i18n.t(key, opts);

describe('summarizeFilterValues', () => {
  it('reads "None" for an empty pick', () => {
    expect(summarizeFilterValues([], t)).toBe('None');
  });

  it('names one or two picks as they are', () => {
    expect(summarizeFilterValues(['Highsec'], t)).toBe('Highsec');
    expect(summarizeFilterValues(['Highsec', 'Lowsec'], t)).toBe('Highsec, Lowsec');
  });

  it('keeps a long pick short: the first two and a count of the rest', () => {
    expect(summarizeFilterValues(['The Forge', 'Domain', 'Heimatar', 'Metropolis'], t)).toBe(
      'The Forge, Domain +2'
    );
  });
});

describe('activeFilterText', () => {
  it('is "label: value", or the label alone for a filter that says it all', () => {
    expect(activeFilterText({ label: 'Space', value: 'Highsec' })).toBe('Space: Highsec');
    expect(activeFilterText({ label: 'Hide risky routes' })).toBe('Hide risky routes');
  });
});

describe('clearFilters', () => {
  it('folds every clear over the value, leaving what no filter owns', () => {
    interface F {
      q: string;
      a: number;
      b: boolean;
    }
    const active: ActiveFilter<F>[] = [
      { label: 'A', clear: (v) => ({ ...v, a: 0 }) },
      { label: 'B', clear: (v) => ({ ...v, b: false }) },
    ];
    expect(clearFilters({ q: 'veld', a: 5, b: true }, active)).toEqual({
      q: 'veld',
      a: 0,
      b: false,
    });
  });
});

describe('boundText', () => {
  it('formats a parsed bound, and shows a half-typed one as typed', () => {
    const format = (value: number) => `#${value}`;
    expect(boundText('250', format)).toBe('#250');
    expect(boundText(' 1e ', format)).toBe('1e');
  });
});

describe('activeDateRangeFilters', () => {
  const labels = { from: 'From', to: 'To' };
  const EMPTY = { startDate: null, endDate: null } as {
    startDate: string | null;
    endDate: string | null;
  };

  it('is nothing for an open range', () => {
    expect(activeDateRangeFilters(EMPTY, t, labels)).toEqual([]);
  });

  it('gives each set end its own pill, each clearing only itself', () => {
    const filter = { startDate: '2026-10-01', endDate: '2026-10-31' };
    const [from, to] = activeDateRangeFilters(filter, t, labels);
    expect(from.label).toBe('From');
    expect(to.label).toBe('To');
    expect(from.clear(filter)).toEqual({ startDate: null, endDate: '2026-10-31' });
    expect(to.clear(filter)).toEqual({ startDate: '2026-10-01', endDate: null });
  });

  it('reads a one-day range as one Day pill that clears both and opens on From', () => {
    const filter = { startDate: '2026-10-05', endDate: '2026-10-05' };
    const pills = activeDateRangeFilters(filter, t, labels);
    expect(pills).toHaveLength(1);
    expect(pills[0].label).toBe('Day');
    expect(pills[0].field).toBe('From');
    expect(pills[0].clear(filter)).toEqual(EMPTY);
  });
});

describe('boundText with an ISK parser', () => {
  it("reads an IskInput's shorthand and grouping", () => {
    const format = (value: number) => String(value);
    expect(boundText('50m', format, parseIskAmount)).toBe('50000000');
    expect(boundText('1,234,567', format, parseIskAmount)).toBe('1234567');
  });
});
