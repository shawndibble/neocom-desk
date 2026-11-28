import '@/i18n';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { CompareHeadToHead } from './CompareHeadToHead';

const row = (key: CompareRow['key'], values: number[], bestIndices: number[] = []): CompareRow => ({
  key,
  values,
  differs: new Set(values).size > 1,
  bestIndices,
});

const ROWS: CompareRow[] = [
  row('totalDps', [1, 2], [1]),
  row('appliedDps', [200, 300], [1]),
  row('bestRange', [48, 3]),
  row('ehp', [20000, 15000], [0]),
  row('capacitor', [42, -190], [0]),
];

function cellsOf(name: string) {
  return within(screen.getByRole('rowheader', { name }).closest('[role="row"]') as HTMLElement)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
}

describe('CompareHeadToHead', () => {
  it('shows only the deciding rows, in their fixed order', () => {
    render(<CompareHeadToHead rows={ROWS} letters={['A', 'B']} />);
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'Applied DPS',
      'EHP',
      'Capacitor',
    ]);
  });

  it('gives applied DPS its range and each later fit its change against the Baseline', () => {
    render(<CompareHeadToHead rows={ROWS} letters={['A', 'B']} />);
    const [a, b] = cellsOf('Applied DPS');
    expect(a).toContain('at 48.0 km');
    expect(a).not.toMatch(/%/);
    expect(b).toContain('+50%');
    expect(cellsOf('EHP')[1]).toContain('−25%');
  });

  it('reads capacitor as stable or running dry, with no percent change', () => {
    render(<CompareHeadToHead rows={ROWS} letters={['A', 'B']} />);
    const [a, b] = cellsOf('Capacitor');
    expect(a).toContain('42% stable');
    expect(b).not.toMatch(/%/);
  });
});
