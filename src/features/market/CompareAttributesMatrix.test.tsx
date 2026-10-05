import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CompareAttributesMatrix } from './CompareAttributesMatrix';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';

const renderMatrix = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

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

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('Structure Hitpoints')).toBeInTheDocument();
    expect(screen.getAllByText('Rifter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Republic Fleet Rifter').length).toBeGreaterThan(0);
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.getByText('1,200 HP')).toBeInTheDocument();
    expect(screen.getByText('250 m/sec')).toBeInTheDocument();
    // Neither item's dogma attributes include the other's — one blank cell per row.
    expect(screen.getAllByText('—')).toHaveLength(2);
    // Item names in the header link to the Market (§6c).
    expect(screen.getByRole('link', { name: 'Rifter' })).toHaveAttribute(
      'href',
      expect.stringContaining('/market/browser?')
    );
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

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('Worth')).toBeInTheDocument();
    expect(screen.getByText('Estimated Price')).toBeInTheDocument();
    // Shorthand on screen (#947); the exact figure is the accessible name.
    expect(screen.getByText('100.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('shows a price still loading as "…", distinct from "—" for no price at all', () => {
    const rows = [
      row(587, 'Rifter', { loading: true, summary: null }),
      row(588, 'Republic Fleet Rifter', { loading: false, summary: null }),
    ];
    const data: CompareAttributesData = { dogmaByTypeId: new Map(), dictionary: {}, names: {} };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders one real-matrix DataTable per attribute category, never the stacked card', () => {
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

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    const [header, ...tables] = screen.getAllByRole('table');
    expect(header).toHaveAttribute('aria-label', 'Compared items');
    expect(tables.map((table) => table.getAttribute('aria-label'))).toEqual([
      'Worth',
      'Speed and Travel',
      'Structure',
    ]);
    for (const table of tables) expect(table).not.toHaveClass('dt-stack');
    // The attribute column stays pinned while item columns scroll under it.
    expect(screen.getByText('Structure Hitpoints')).toHaveClass('sticky', 'left-0');
  });

  it('names each item once, in the one sticky header row above every category', () => {
    const rows = [row(587, 'Rifter'), row(588, 'Republic Fleet Rifter')];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map([[587, [{ attribute_id: 9, value: 1200 }]]]),
      dictionary: { 9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' } },
      names: {},
    };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    const header = screen.getByRole('table', { name: 'Compared items' });
    expect(header).toHaveClass('sticky', 'top-0');
    expect(within(header).getByText('Rifter')).toBeInTheDocument();
    // The category tables keep their own header for assistive tech, hidden from sight.
    expect(screen.getByRole('table', { name: 'Structure' })).toHaveClass('[&_thead]:sr-only');
  });

  it("removes an item from its header's x", async () => {
    const onRemove = vi.fn();
    const rows = [row(587, 'Rifter'), row(588, 'Republic Fleet Rifter')];
    const data: CompareAttributesData = { dogmaByTypeId: new Map(), dictionary: {}, names: {} };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} onRemove={onRemove} />);

    const header = screen.getByRole('table', { name: 'Compared items' });
    await userEvent.click(
      within(header).getByRole('button', { name: 'Remove Republic Fleet Rifter' })
    );
    expect(onRemove).toHaveBeenCalledWith(588);
  });

  it('moves the words every name shares into the corner, keeping full names for assistive tech', () => {
    const rows = [row(1, 'Large Shield Extender II'), row(2, 'Caldari Navy Large Shield Extender')];
    const data: CompareAttributesData = { dogmaByTypeId: new Map(), dictionary: {}, names: {} };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    const header = screen.getByRole('table', { name: 'Compared items' });
    expect(within(header).getByText('Large Shield Extender')).toBeInTheDocument();
    expect(within(header).getByText('II')).toBeInTheDocument();
    expect(within(header).getByText('Caldari Navy')).toBeInTheDocument();
    expect(
      within(header).getByText('Caldari Navy Large Shield Extender', { selector: '.sr-only' })
    ).toBeInTheDocument();
  });

  it('hides attributes every item shares by default, and shows them when Differences only is cleared', async () => {
    const rows = [row(1, 'Rifter'), row(2, 'Slasher')];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map([
        [
          1,
          [
            { attribute_id: 9, value: 1200 },
            { attribute_id: 37, value: 300 },
          ],
        ],
        [
          2,
          [
            { attribute_id: 9, value: 1200 },
            { attribute_id: 37, value: 400 },
          ],
        ],
      ]),
      dictionary: {
        9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
        37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
      },
      names: {},
    };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    expect(screen.getByRole('checkbox', { name: 'Differences only' })).toBeChecked();
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.queryByText('Structure Hitpoints')).not.toBeInTheDocument();
    // A category left with nothing differing disappears entirely.
    expect(screen.queryByRole('table', { name: 'Structure' })).not.toBeInTheDocument();
    expect(screen.getByText('1 identical hidden')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Differences only' }));

    expect(screen.getByText('Structure Hitpoints')).toBeInTheDocument();
    expect(screen.queryByText('1 identical hidden')).not.toBeInTheDocument();
  });

  it('collapses and re-expands a category from its heading', async () => {
    const rows = [row(1, 'Rifter'), row(2, 'Slasher')];
    const data: CompareAttributesData = {
      dogmaByTypeId: new Map([
        [1, [{ attribute_id: 37, value: 300 }]],
        [2, [{ attribute_id: 37, value: 400 }]],
      ]),
      dictionary: {
        37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
      },
      names: {},
    };

    renderMatrix(<CompareAttributesMatrix rows={rows} data={data} />);

    const toggle = screen.getByRole('button', { name: 'Speed and Travel' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(screen.queryByText('Maximum Velocity')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speed and Travel 1 row' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Speed and Travel 1 row' }));
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
  });
});
