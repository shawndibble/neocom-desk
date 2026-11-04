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
vi.mock('@/market/prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/market/prices')>()),
  getHubPrices: vi.fn(),
}));

const { MadeFromSection } = await import('./MadeFromSection');
const { getHubPrices } = await import('@/market/prices');
const { DEFAULT_TRADE_HUB } = await import('@/market/hubs');

function sellPrices(prices: Record<number, number | null>) {
  return new Map(
    Object.entries(prices).map(([typeId, sellMin]) => [
      Number(typeId),
      { sellMin, buyMax: null, sellVolume: 0, buyVolume: 0 },
    ])
  );
}

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

function renderSection(
  catalog: BlueprintCatalog,
  typeId: number,
  pricing?: Parameters<typeof MadeFromSection>[0]['pricing']
) {
  return render(
    <MemoryRouter>
      <FakeItemActions actions={fakeItemActions({ blueprints: catalog })}>
        <MadeFromSection typeId={typeId} pricing={pricing} />
      </FakeItemActions>
    </MemoryRouter>
  );
}

describe('MadeFromSection', () => {
  it("closes on a run's input cost at the hub and the margin on the best sell", async () => {
    vi.mocked(getHubPrices).mockResolvedValueOnce(sellPrices({ [TRITANIUM]: 4, [PYERITE]: 10 }));
    renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER, {
      hub: DEFAULT_TRADE_HUB,
      bestSell: 30_000,
    });

    // 4,500 x 4 + 1,200 x 10 = 30,000 ISK, and it sells for exactly that.
    const cost = await screen.findByText('Inputs per run at Jita 4-4 sell prices:');
    expect(cost.closest('p')).toHaveTextContent('30,000.00 ISK');
    expect(screen.getByText('Margin on best sell:').closest('p')).toHaveTextContent('0.0%');
    expect(getHubPrices).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [TRITANIUM, PYERITE]);
  });

  it('signs the margin and leaves it out with no best sell', async () => {
    vi.mocked(getHubPrices).mockResolvedValue(sellPrices({ [TRITANIUM]: 4, [PYERITE]: 10 }));
    const { unmount } = renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER, {
      hub: DEFAULT_TRADE_HUB,
      bestSell: 37_500,
    });
    expect(await screen.findByText('+20.0%')).toBeInTheDocument();
    unmount();

    renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER, {
      hub: DEFAULT_TRADE_HUB,
      bestSell: null,
    });
    expect(await screen.findByText('Inputs per run at Jita 4-4 sell prices:')).toBeInTheDocument();
    expect(screen.queryByText('Margin on best sell:')).not.toBeInTheDocument();
  });

  it('leaves the cost line out while an input has no price, rather than showing 0', async () => {
    vi.mocked(getHubPrices).mockResolvedValueOnce(sellPrices({ [TRITANIUM]: 4, [PYERITE]: null }));
    renderSection(catalogOf([entry(RIFTER, 'Rifter')]), RIFTER, {
      hub: DEFAULT_TRADE_HUB,
      bestSell: 30_000,
    });
    await vi.waitFor(() => expect(getHubPrices).toHaveBeenCalled());
    expect(screen.getByText('Makes 1 per run · 10m')).toBeInTheDocument();
    expect(screen.queryByText(/Inputs per run/)).not.toBeInTheDocument();
  });

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
