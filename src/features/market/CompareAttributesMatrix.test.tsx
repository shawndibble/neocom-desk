import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { CompareAttributesMatrix } from './CompareAttributesMatrix';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';

function row(typeId: number, itemName: string, opts: Partial<CompareRow> = {}): CompareRow {
  return { typeId, itemName, loading: false, summary: null, ...opts };
}

function summary(bestSell: number | null) {
  return { bestSell, bestBuy: null, spread: null, availableVolume: 0 };
}

describe('CompareAttributesMatrix', () => {
  it('renders items as columns, the union of attributes as rows, with blank cells for missing attributes', () => {
    const rows = [
      row(587, 'Rifter', { summary: summary(100) }),
      row(588, 'Republic Fleet Rifter', { summary: summary(200) }),
    ];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map([
        [587, [{ attribute_id: 9, value: 1200 }]],
        [588, [{ attribute_id: 37, value: 250 }]],
      ]),
      dictionary: {
        9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
        37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
      },
      names: {},
    };

    render(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('Structure Hitpoints')).toBeInTheDocument();
    // One table per attribute category (#1128), so each item's column header
    // repeats once per category rather than appearing once for the matrix.
    expect(screen.getAllByText('Rifter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Republic Fleet Rifter').length).toBeGreaterThan(0);
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.getByText('1,200 HP')).toBeInTheDocument();
    expect(screen.getByText('250 m/sec')).toBeInTheDocument();
    // Neither item's dogma attributes include the other's — one blank cell per row.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows the Worth section with Estimated Price as the first row, from each row’s own summary', () => {
    const rows = [
      row(587, 'Rifter', { summary: summary(100) }),
      row(588, 'Republic Fleet Rifter', { summary: null }),
    ];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map(),
      dictionary: {},
      names: {},
    };

    render(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('Worth')).toBeInTheDocument();
    expect(screen.getByText('Estimated Price')).toBeInTheDocument();
    // Shorthand on screen (#947); the exact figure is the accessible name.
    expect(screen.getByLabelText('100.00 ISK')).toBeInTheDocument();
  });

  it('shows a price still loading as "…", distinct from "—" for no price at all', () => {
    const rows = [
      row(587, 'Rifter', { loading: true, summary: null }),
      row(588, 'Republic Fleet Rifter', { loading: false, summary: null }),
    ];
    const data: CompareAttributesData = { dogmaByTypeId: new Map(), dictionary: {}, names: {} };

    render(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders one stacking DataTable per attribute category, labelled per item for the stacked view', () => {
    const rows = [row(587, 'Rifter'), row(588, 'Republic Fleet Rifter')];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map([
        [587, [{ attribute_id: 9, value: 1200 }]],
        [588, [{ attribute_id: 37, value: 250 }]],
      ]),
      dictionary: {
        9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
        37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
      },
      names: {},
    };

    render(<CompareAttributesMatrix rows={rows} data={data} />);

    const tables = screen.getAllByRole('table');
    expect(tables.map((table) => table.getAttribute('aria-label'))).toEqual([
      'Worth',
      'Speed and Travel',
      'Structure',
    ]);
    for (const table of tables) expect(table).toHaveClass('dt-stack');

    const hpCell = screen.getByText('1,200 HP');
    expect(hpCell).toHaveAttribute('data-label', 'Rifter');
    expect(screen.getByText('Structure Hitpoints')).toHaveClass('dt-primary');
  });
});
