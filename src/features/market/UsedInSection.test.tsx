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

const { UsedInSection, USED_IN_PAGE } = await import('./UsedInSection');

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

function renderSection(catalog: BlueprintCatalog, typeId = TRITANIUM, onNavigate = vi.fn()) {
  const actions = fakeItemActions({ blueprints: catalog });
  render(
    <MemoryRouter>
      <FakeItemActions actions={actions}>
        <UsedInSection typeId={typeId} onNavigate={onNavigate} />
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

  it('closes the modal once a row action navigates away', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSection(catalogOf([entry(638, 587, 'Rifter', 4500)]), TRITANIUM, onNavigate);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByText('Rifter').closest('li')!);
    await user.click(screen.getByRole('menuitem', { name: 'View in Market' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('clears the filter when Show info swaps the modal to another item', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) =>
      entry(10_000 + i, 20_000 + i, `Product ${String(i).padStart(2, '0')}`, 1)
    );
    const catalog = catalogOf([...many, entry(30_000, 30_001, 'Hull', 7)]);
    catalog.entries[12].blueprint.materials = [{ typeID: 20_000, quantity: 7 }];
    const actions = fakeItemActions({ blueprints: catalog });
    const { rerender } = render(
      <MemoryRouter>
        <FakeItemActions actions={actions}>
          <UsedInSection typeId={TRITANIUM} onNavigate={() => {}} />
        </FakeItemActions>
      </MemoryRouter>
    );
    await user.type(screen.getByRole('searchbox', { name: 'Filter products' }), 'nothing');
    expect(screen.getByText('No products match.')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <FakeItemActions actions={actions}>
          <UsedInSection typeId={20_000} onNavigate={() => {}} />
        </FakeItemActions>
      </MemoryRouter>
    );
    expect(screen.getByText('Hull')).toBeInTheDocument();
  });

  it('renders nothing for an item no blueprint consumes', () => {
    const { container } = render(
      <MemoryRouter>
        <FakeItemActions actions={fakeItemActions({ blueprints: catalogOf([]) })}>
          <UsedInSection typeId={587} onNavigate={() => {}} />
        </FakeItemActions>
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing outside a page with Item Actions', () => {
    const { container } = render(<UsedInSection typeId={TRITANIUM} onNavigate={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pages a long list behind "Show more" and filters it by product name', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: USED_IN_PAGE + 5 }, (_, i) =>
      entry(10_000 + i, 20_000 + i, `Product ${String(i).padStart(3, '0')}`, 1)
    );
    renderSection(catalogOf(many));

    expect(screen.getAllByRole('listitem')).toHaveLength(USED_IN_PAGE);
    await user.click(
      screen.getByRole('button', { name: `Show more (${USED_IN_PAGE} of ${USED_IN_PAGE + 5})` })
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(USED_IN_PAGE + 5);
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();

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
