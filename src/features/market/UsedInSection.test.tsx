import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';
import type { BlueprintType } from '@/sde/types';
import { FakeItemActions, fakeItemActions } from './__fixtures__/itemActions';

vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const { UsedInSection, USED_IN_CAP } = await import('./UsedInSection');

const TRITANIUM = 34;

function entry(
  blueprintTypeID: number,
  productTypeID: number,
  productName: string,
  quantity: number,
  activity: BlueprintType['activity'] = 'manufacturing'
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    productTypeID,
    productName,
    productNameLower: productName.toLowerCase(),
    blueprint: {
      name: `${productName} Blueprint`,
      time: 600,
      materials: [{ typeID: TRITANIUM, quantity }],
      products: [{ typeID: productTypeID, quantity: 1 }],
      skills: [],
      activity,
    },
  };
}

function catalogOf(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: {},
  };
}

function renderSection(catalog: BlueprintCatalog, typeId = TRITANIUM) {
  const actions = fakeItemActions({ blueprints: catalog });
  render(
    <MemoryRouter>
      <FakeItemActions actions={actions}>
        <UsedInSection typeId={typeId} />
      </FakeItemActions>
    </MemoryRouter>
  );
  return actions;
}

describe('UsedInSection', () => {
  it('lists each product the item goes into, with its quantity per run', () => {
    renderSection(
      catalogOf([
        entry(638, 587, 'Rifter', 4500),
        entry(46157, 16667, 'Reinforced Carbon Fiber', 3200, 'reaction'),
      ])
    );

    expect(screen.getByRole('heading', { name: 'Used in (2)' })).toBeInTheDocument();
    const rifter = screen.getByText('Rifter').closest('li')!;
    expect(rifter).toHaveTextContent('4,500 / run');
    const fiber = screen.getByText('Reinforced Carbon Fiber').closest('li')!;
    expect(fiber).toHaveTextContent('Reaction');
  });

  it('gives every row the item menu, with Build Plan ready and Show info opening that product', async () => {
    const user = userEvent.setup();
    const actions = renderSection(catalogOf([entry(638, 587, 'Rifter', 4500)]));

    fireEvent.contextMenu(screen.getByText('Rifter').closest('li')!);
    // Enabled, not "checking…": the row already knows its blueprint.
    expect(screen.getByRole('menuitem', { name: 'Build Plan' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(587, 'Rifter');
  });

  it('offers the same menu from a visible "More actions" button', () => {
    renderSection(catalogOf([entry(638, 587, 'Rifter', 4500)]));
    expect(screen.getByRole('button', { name: 'More actions for Rifter' })).toBeInTheDocument();
  });

  it('renders nothing for an item no blueprint consumes', () => {
    const { container } = render(
      <MemoryRouter>
        <FakeItemActions actions={fakeItemActions({ blueprints: catalogOf([]) })}>
          <UsedInSection typeId={587} />
        </FakeItemActions>
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing outside a page with Item Actions', () => {
    const { container } = render(<UsedInSection typeId={TRITANIUM} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('caps a long list behind "Show all" and filters it by product name', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: USED_IN_CAP + 5 }, (_, i) =>
      entry(10_000 + i, 20_000 + i, `Product ${String(i).padStart(3, '0')}`, 1)
    );
    renderSection(catalogOf(many));

    expect(screen.getAllByRole('listitem')).toHaveLength(USED_IN_CAP);
    await user.click(screen.getByRole('button', { name: `Show all ${USED_IN_CAP + 5}` }));
    expect(screen.getAllByRole('listitem')).toHaveLength(USED_IN_CAP + 5);

    await user.type(screen.getByRole('searchbox', { name: 'Filter products' }), 'product 05');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Product 050'),
      expect.stringContaining('Product 051'),
      expect.stringContaining('Product 052'),
      expect.stringContaining('Product 053'),
      expect.stringContaining('Product 054'),
    ]);
  });
});
