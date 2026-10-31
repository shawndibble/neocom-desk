import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';
import type { BlueprintType } from '@/sde/types';
import { FakeItemActions, fakeItemActions } from './__fixtures__/itemActions';

vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
}));

const { MadeFromSection } = await import('./MadeFromSection');

const RIFTER = 587;
const TRITANIUM = 34;
const PYERITE = 35;

function entry(
  productTypeID: number,
  productName: string,
  opts: Partial<BlueprintType> & { outQty?: number } = {}
): BlueprintCatalogEntry {
  return {
    blueprintTypeID: productTypeID + 1,
    productTypeID,
    productName,
    productNameLower: productName.toLowerCase(),
    blueprint: {
      name: `${productName} Blueprint`,
      time: 600,
      materials: [
        { typeID: TRITANIUM, quantity: 4500 },
        { typeID: PYERITE, quantity: 1200 },
      ],
      products: [{ typeID: productTypeID, quantity: opts.outQty ?? 1 }],
      skills: [],
      activity: 'manufacturing',
      ...opts,
    },
  };
}

function catalogOf(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  return {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: { [TRITANIUM]: { name: 'Tritanium' }, [PYERITE]: { name: 'Pyerite' } } as never,
  };
}

function renderSection(catalog: BlueprintCatalog, typeId: number) {
  return render(
    <MemoryRouter>
      <FakeItemActions actions={fakeItemActions({ blueprints: catalog })}>
        <MadeFromSection typeId={typeId} />
      </FakeItemActions>
    </MemoryRouter>
  );
}

describe('MadeFromSection', () => {
  it('shows a T1 module its inputs per run, output and base time', () => {
    renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER);

    const header = screen.getByRole('button', { name: 'Made from · Manufacturing' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tritanium').closest('li')).toHaveTextContent('4,500 / run');
    expect(screen.getByText('Pyerite').closest('li')).toHaveTextContent('1,200 / run');
    expect(screen.getByText('Makes 1 per run · 10m')).toBeInTheDocument();
  });

  it('shows a reaction product its formula, output quantity and time', () => {
    renderSection(
      catalogOf([entry(16667, 'Reinforced Carbon Fiber', { activity: 'reaction', outQty: 10000 })]),
      16667
    );
    expect(screen.getByRole('button', { name: 'Made from · Reaction' })).toBeInTheDocument();
    expect(screen.getByText(/Makes 10,000 per run/)).toBeInTheDocument();
  });

  it('collapses and reopens', async () => {
    const user = userEvent.setup();
    renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER);
    await user.click(screen.getByRole('button', { name: 'Made from · Manufacturing' }));
    expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
  });

  it('reopens when Show info swaps the item', async () => {
    const user = userEvent.setup();
    const catalog = catalogOf([entry(RIFTER, 'Rifter'), entry(588, 'Reaper')]);
    const tree = (typeId: number) => (
      <MemoryRouter>
        <FakeItemActions actions={fakeItemActions({ blueprints: catalog })}>
          <MadeFromSection typeId={typeId} />
        </FakeItemActions>
      </MemoryRouter>
    );
    const { rerender } = render(tree(RIFTER));
    await user.click(screen.getByRole('button', { name: 'Made from · Manufacturing' }));
    rerender(tree(588));
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
  });

  it('renders nothing for an item no blueprint makes', () => {
    const { container } = renderSection(catalogOf([entry(RIFTER, 'Rifter')]), TRITANIUM);
    expect(container).toBeEmptyDOMElement();
  });
});
