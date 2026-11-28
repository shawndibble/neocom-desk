import '@/i18n';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { CompareHeadToHead } from './CompareHeadToHead';

const row = (
  key: CompareRow['key'],
  values: number[],
  bestIndices: number[] = [],
  direction: CompareRow['direction'] = 'higher'
): CompareRow => ({ key, values, differs: new Set(values).size > 1, bestIndices, direction });

const ROWS: CompareRow[] = [
  row('totalDps', [1, 2], [1]),
  row('appliedDps', [200, 300], [1]),
  row('bestRange', [48, 3], [], 'neutral'),
  row('ehp', [20000, 15000], [0]),
  row('capacitor', [42, -190], [0]),
];

const TWO = [
  { letter: 'A', position: 0 },
  { letter: 'B', position: 1 },
];

function cellsOf(name: string) {
  return within(screen.getByRole('rowheader', { name }).closest('[role="row"]') as HTMLElement)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
}

describe('CompareHeadToHead', () => {
  it('shows only the deciding rows, in their fixed order', () => {
    render(<CompareHeadToHead rows={ROWS} columns={TWO} />);
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'Applied DPS',
      'EHP',
      'Capacitor',
    ]);
  });

  it('gives applied DPS its range and each later fit its change against the Baseline', () => {
    render(<CompareHeadToHead rows={ROWS} columns={TWO} />);
    const [a, b] = cellsOf('Applied DPS');
    expect(a).toContain('at 48.0 km');
    expect(a).not.toMatch(/%/);
    expect(b).toContain('+50.0%');
    expect(cellsOf('EHP')[1]).toContain('−25.0%');
  });

  it('reads capacitor as stable or running dry, with no percent change', () => {
    render(<CompareHeadToHead rows={ROWS} columns={TWO} />);
    const [a, b] = cellsOf('Capacitor');
    expect(a).toContain('42% stable');
    expect(b).not.toMatch(/%/);
  });

  it('keeps a column with no stats as a dash, so the next fit stays under its own card', () => {
    render(
      <CompareHeadToHead
        rows={ROWS}
        columns={[
          { letter: 'A', position: 0 },
          { letter: 'B', position: null },
          { letter: 'C', position: 1 },
        ]}
      />
    );
    const [a, b, c] = cellsOf('EHP');
    expect(a).toContain('20000');
    expect(b).toMatch(/^B—$/);
    expect(c).toContain('15000');
  });
});
