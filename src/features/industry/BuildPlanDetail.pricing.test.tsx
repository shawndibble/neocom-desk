import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { recallFacility, rememberFacility } from './facilityMemory';
import { type OwnedStockSnapshot } from './ownedStockDetection';
import {
  toastStatus,
  ENTRY,
  Harness,
  runsInput,
  valueOf,
  openSetup,
  installBuildPlanDetailHarness,
} from './buildPlanDetailHarness.testutil';
import { loadMarketSnapshot, breakEvenRuns, implantsGrant } from './buildPlanDetailMocks.testutil';

vi.mock('@/features/market/priceVsMedian', async () =>
  (await import('./buildPlanDetailMocks.testutil')).priceVsMedianMock()
);
vi.mock('./marketData', async () =>
  (await import('./buildPlanDetailMocks.testutil')).marketDataMock()
);
vi.mock('@/market/prices', async (importOriginal) =>
  (await import('./buildPlanDetailMocks.testutil')).pricesMock(
    await importOriginal<typeof import('@/market/prices')>()
  )
);
vi.mock('@/features/character/systemLookup', async () =>
  (await import('./buildPlanDetailMocks.testutil')).systemLookupMock()
);
vi.mock('@/engine/industry/breakEvenRuns', async (importOriginal) =>
  (await import('./buildPlanDetailMocks.testutil')).breakEvenRunsMock(
    await importOriginal<typeof import('@/engine/industry/breakEvenRuns')>()
  )
);
vi.mock('@/features/character/systemSecurity', async () =>
  (await import('./buildPlanDetailMocks.testutil')).systemSecurityMock()
);
vi.mock('@/app/useGrantedScopes', async () =>
  (await import('./buildPlanDetailMocks.testutil')).grantedScopesMock()
);

installBuildPlanDetailHarness();

describe('BuildPlanDetail material price basis', () => {
  /** Tritanium at 5 sell / 4 buy, so the two bases are told apart by the price cell. */
  function pricedSnapshot() {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: 100_000 },
      hubBuyPrices: { 34: 4, 587: 90_000 },
      adjustedPrices: { 34: 4.5 },
      systemCostIndex: 0.05,
    });
  }

  const basisSelect = () => screen.getByRole('combobox', { name: 'Material prices' });
  // The price is edited in place, so at rest it is the value's text.
  const tritaniumPrice = () => ({
    value: (screen.getByRole('button', { name: /^Edit price for Tritanium,/ }).textContent ?? '')
      .replace('Edit price for Tritanium,', '')
      .trim(),
  });

  it('opens on sell orders and offers both sides of the book', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(basisSelect()).toHaveTextContent('Sell orders');

    await user.click(basisSelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/^\W+/, ''))).toEqual([
      'Sell orders',
      'Buy orders',
    ]);
  });

  it('stores the picked basis on the plan', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    pricedSnapshot();
    render(<Harness onUpdate={onUpdate} />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    await user.click(basisSelect());
    await user.click(await screen.findByRole('option', { name: /Buy orders/ }));

    expect(onUpdate).toHaveBeenCalledWith({ materialPriceBasis: 'buy' });
  });

  it('re-prices the materials off the buy side once picked', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(tritaniumPrice().value).toBe('5');
    const fetchesBefore = loadMarketSnapshot.mock.calls.length;

    await user.click(basisSelect());
    await user.click(await screen.findByRole('option', { name: /Buy orders/ }));

    await waitFor(() => expect(tritaniumPrice().value).toBe('4'));
    // One snapshot, both sides: switching basis must never spend a request.
    expect(loadMarketSnapshot.mock.calls.length).toBe(fetchesBefore);
  });

  it('prices a stored buy-basis plan off the buy side on first render', async () => {
    const user = userEvent.setup();
    pricedSnapshot();
    render(<Harness plan={{ materialPriceBasis: 'buy' }} />);
    await openSetup(user);

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(tritaniumPrice().value).toBe('4');
    expect(basisSelect()).toHaveTextContent('Buy orders');
  });
});

describe('BuildPlanDetail Corp Assets (issue #798)', () => {
  // Corp Assets lives in the Owned materials popover.
  const corpAssetsToggle = () => screen.getByRole('button', { name: 'Corp Assets' });
  async function openOwned() {
    fireEvent.click(await screen.findByRole('button', { name: /^Owned materials/ }));
  }

  it("renders as a toggle button, not a checkbox — matches the app's other toggles", async () => {
    render(<Harness plan={{ runs: 10 }} corpOwnedStock={{ available: true }} />);
    await screen.findByText('Tritanium');
    await openOwned();

    expect(corpAssetsToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Corp Assets' })).not.toBeInTheDocument();
  });

  it('is disabled when the active character lacks the corp Director role', async () => {
    render(<Harness plan={{ runs: 10 }} corpOwnedStock={{ available: false }} />);
    await screen.findByText('Tritanium');
    await openOwned();

    expect(corpAssetsToggle()).toBeDisabled();
  });

  it('toggles on and writes includeCorpAssets when the Director role is held', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <Harness plan={{ runs: 10 }} corpOwnedStock={{ available: true }} onUpdate={onUpdate} />
    );
    await screen.findByText('Tritanium');
    await openOwned();

    await user.click(corpAssetsToggle());

    expect(onUpdate).toHaveBeenCalledWith({ includeCorpAssets: true });
  });
});

describe('BuildPlanDetail item context menu', () => {
  const viewInMarket = () => screen.findByRole('menuitem', { name: 'View in Market' });

  it("opens the standard item menu on the plan's own product heading", async () => {
    render(<Harness />);

    fireEvent.contextMenu(await screen.findByRole('heading', { name: 'Rifter', level: 2 }));

    expect(await viewInMarket()).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it.each([
    ['an input row', 'Pyerite'],
    ['the title', 'How to build Tritanium'],
  ])('opens it in the recipe modal, on %s', async (_where, text) => {
    const user = userEvent.setup();
    render(<Harness plan={{ runs: 10 }} />);

    await user.click(screen.getByRole('button', { name: 'Build instead: Tritanium' }));
    await user.click(await screen.findByRole('button', { name: 'Recipe: Tritanium' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.contextMenu(within(dialog).getByText(text));

    expect(await viewInMarket()).toBeInTheDocument();
  });
});

describe('BuildPlanDetail Character details implant note (issue #1588)', () => {
  const NOTE = 'Assumes no implants';

  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: 5, hydrated: true });
  });

  afterEach(() => {
    implantsGrant.lacking.clear();
  });

  it('notes that job time assumes no implants when the grant is missing', async () => {
    implantsGrant.lacking.add(5);
    render(<Harness />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it('hides the note once Character details is granted', async () => {
    render(<Harness />);

    await screen.findByRole('button', { name: 'Edit setup' });
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

/**
 * "Use all" is every row's own "Use assets" at once. It used to skip any row
 * with a number in it — a 0 from "Use none" included — and said nothing, so
 * after "Use none" it looked like a dead button while rows still offered stock.
 */
describe('BuildPlanDetail Use all / Use none', () => {
  const TRITANIUM_IN_JITA: OwnedStockSnapshot = {
    sources: [
      {
        characterId: 1,
        assets: [
          {
            item_id: 1,
            type_id: 34,
            location_id: 60003760,
            location_flag: 'Hangar',
            location_type: 'station',
            quantity: 5000,
            is_singleton: false,
          },
        ],
      },
    ],
    characterNames: new Map([[1, 'Pilot']]),
    incompleteCharacters: [],
  };

  it('fills a row Use none zeroed, says so, and Undo puts the 0 back', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(
      <Harness
        plan={{ runs: 1, materialSourcing: { 34: { ownedQuantity: 0 } } }}
        ownedStockSnapshot={TRITANIUM_IN_JITA}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: /^Owned materials/ }));
    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 100 } }]);
    expect(toastStatus()).toHaveTextContent('Filled Have on 1 material from your assets');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 0 } }]);
  });

  it('leaves a Blueprint Acquisition row alone even with a packaged blueprint in a hangar', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    const [source] = TRITANIUM_IN_JITA.sources;
    const packagedBlueprint = {
      ...source!.assets[0]!,
      item_id: 2,
      type_id: ENTRY.blueprintTypeID,
      quantity: 1,
    };
    const withPackagedBlueprint: OwnedStockSnapshot = {
      ...TRITANIUM_IN_JITA,
      sources: [{ ...source!, assets: [...source!.assets, packagedBlueprint] }],
    };
    render(
      <Harness
        plan={{ runs: 1 }}
        ownedStockSnapshot={withPackagedBlueprint}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: /^Owned materials/ }));
    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).toHaveBeenLastCalledWith([{ typeID: 34, patch: { ownedQuantity: 100 } }]);
  });

  it('Use none still clears a Have a Blueprint Acquisition row was given', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(
      <Harness
        plan={{ runs: 1, materialSourcing: { [ENTRY.blueprintTypeID]: { ownedQuantity: 1 } } }}
        onSourcing={onSourcing}
      />
    );

    await user.click(await screen.findByRole('button', { name: /^Owned materials/ }));
    await user.click(await screen.findByRole('button', { name: 'Use none' }));

    expect(onSourcing).toHaveBeenLastCalledWith([
      { typeID: ENTRY.blueprintTypeID, patch: { ownedQuantity: 0 } },
    ]);
  });

  it('says there is nothing to fill instead of doing nothing silently', async () => {
    const user = userEvent.setup();
    const onSourcing = vi.fn();
    render(<Harness plan={{ runs: 1 }} onSourcing={onSourcing} />);

    await user.click(await screen.findByRole('button', { name: /^Owned materials/ }));
    await user.click(await screen.findByRole('button', { name: 'Use all' }));

    expect(onSourcing).not.toHaveBeenCalled();
    expect(toastStatus()).toHaveTextContent(/^Nothing to fill/);
  });
});

describe('BuildPlanDetail Break Even button', () => {
  // Rifter at 100 ISK is a loss; the plan also carries the fixture's 150M blueprint cost.
  function priceRifter(rifterPrice: number) {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: rifterPrice },
      hubBuyPrices: { 34: 4, 587: rifterPrice },
      adjustedPrices: { 34: 4.5, 587: rifterPrice },
      systemCostIndex: 0.05,
    });
  }
  const breakEvenButton = () => screen.findByRole('button', { name: 'Break Even' });

  afterEach(() => {
    breakEvenRuns.mockReset();
    loadMarketSnapshot.mockReset();
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
    });
  });

  it('sets runs to the break-even count when the plan loses ISK', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(250);
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(await breakEvenButton());

    expect(onUpdate).toHaveBeenCalledWith({ runs: 250 });
    expect(valueOf(runsInput())).toBe('250');
  });

  it('follows the hero: offered when selling the owned stock beats building, though the build pays', async () => {
    const user = userEvent.setup();
    // Profitable with owned Tritanium counted free, a loss once it is
    // charged at what it would sell for (a buy order at 1M a unit).
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 34: 5, 587: 100_000_000 },
      hubBuyPrices: { 34: 1_000_000, 587: 100_000_000 },
      adjustedPrices: { 34: 4.5, 587: 100_000_000 },
      systemCostIndex: 0.05,
    });
    breakEvenRuns.mockReturnValue(null);
    render(<Harness plan={{ runs: 10, materialSourcing: { 34: { ownedQuantity: 1000 } } }} />);

    await user.click(await breakEvenButton());

    // The search probes profit on the sell-value basis: still a loss at 10 runs.
    const profitAt = breakEvenRuns.mock.calls[0][0] as (runs: number) => number | null;
    expect(profitAt(10)).toBeLessThan(0);
  });

  it('is absent when the plan already makes a profit', async () => {
    const user = userEvent.setup();
    priceRifter(100_000_000); // clears the fixture's 150M blueprint cost over 10 runs
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);

    await screen.findByRole('button', { name: /^Edit price for Tritanium,/ });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Break Even' })).not.toBeInTheDocument()
    );
  });

  it('says so, and leaves runs alone, when no break-even count exists', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(null);
    render(<Harness plan={{ runs: 10 }} onUpdate={onUpdate} />);
    await openSetup(user);

    await user.click(await breakEvenButton());

    expect(await screen.findByText(/No break even found up to/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(valueOf(runsInput())).toBe('10');
  });

  it('drops the "none found" note once the plan changes', async () => {
    const user = userEvent.setup();
    priceRifter(100);
    breakEvenRuns.mockReturnValue(null);
    render(<Harness plan={{ runs: 10 }} />);
    await openSetup(user);
    await user.click(await breakEvenButton());
    expect(await screen.findByText(/No break even found up to/)).toBeInTheDocument();

    await user.clear(runsInput());
    await user.type(runsInput(), '20');
    await user.tab();

    expect(screen.queryByText(/No break even found up to/)).not.toBeInTheDocument();
  });
});

describe('BuildPlanDetail job cost index without an ESI figure (J-Space)', () => {
  const costIndexInput = () => screen.getByRole('textbox', { name: 'Job cost index %' });
  const wormholeStructure = {
    facility: 'raitaru',
    buildSystemId: 31000005,
    buildSystemName: 'J123456',
    buildLocationId: 1040000000001,
    buildLocationName: 'J123456 - Home',
  } as const;

  beforeEach(() => {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0,
      systemCostIndexMissing: true,
    });
  });

  afterEach(() => {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
      systemCostIndexMissing: false,
    });
  });

  it('says why the fee is 0 and offers a field with a tooltip on where to find the number', async () => {
    const user = userEvent.setup();
    render(<Harness plan={wormholeStructure} />);
    await openSetup(user);

    expect(await screen.findByText(/ESI has no cost index for this system/)).toBeInTheDocument();
    expect(costIndexInput()).toHaveAccessibleDescription(/ESI has no cost index/);
    await user.hover(screen.getByRole('button', { name: 'Where to find the job cost index' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Facilities tab/);
  });

  it('commits the typed index and remembers it for the facility', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={wormholeStructure} onUpdate={onUpdate} />);
    await openSetup(user);
    await screen.findByText(/ESI has no cost index for this system/);

    await user.type(costIndexInput(), '3.5');
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({ costIndexOverridePct: 3.5 });
    await waitFor(async () =>
      expect(await recallFacility({ buildLocationId: 1040000000001 })).toMatchObject({
        costIndexPct: 3.5,
      })
    );
  });

  it('fills the index back in when a plan opens at a facility already described', async () => {
    await rememberFacility({ buildLocationId: 1040000000001 }, { costIndexPct: 2.25 });
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<Harness plan={wormholeStructure} onUpdate={onUpdate} />);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ costIndexOverridePct: 2.25 }));
    await openSetup(user);
    expect(costIndexInput()).toHaveValue('2.25');
  });

  it('shows no field where ESI has the index', async () => {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: {},
      hubBuyPrices: {},
      adjustedPrices: {},
      systemCostIndex: 0.05,
      systemCostIndexMissing: false,
    });
    const user = userEvent.setup();
    render(<Harness plan={{ facility: 'raitaru' }} />);
    await openSetup(user);

    expect(screen.queryByRole('textbox', { name: 'Job cost index %' })).not.toBeInTheDocument();
  });
});

describe('BuildPlanDetail remembers a structure for the next plan', () => {
  it('fills rigs and tax into a plan that opens at a structure already described', async () => {
    await rememberFacility(
      { buildLocationId: 1035 },
      { rigFit: ['meT2', 'none', 'none'], facilityTaxPct: 2.5 }
    );
    const onUpdate = vi.fn();
    render(
      <Harness
        plan={{
          facility: 'raitaru',
          buildLocationId: 1035,
          buildSystemId: 30003888,
          buildSystemName: 'Badivefi',
        }}
        onUpdate={onUpdate}
      />
    );

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        rigFit: ['meT2', 'none', 'none'],
        facilityTaxPct: 2.5,
      })
    );
  });

  it('files the rigs and tax a pilot sets under the structure they are set for', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        plan={{
          facility: 'raitaru',
          buildLocationId: 1035,
          buildSystemId: 30003888,
          buildSystemName: 'Badivefi',
        }}
      />
    );
    await openSetup(user);

    const tax = screen.getByRole('textbox', { name: 'Facility tax %' });
    await user.clear(tax);
    await user.type(tax, '2.5');
    await user.tab();

    await waitFor(async () =>
      expect(await recallFacility({ buildLocationId: 1035 })).toMatchObject({ facilityTaxPct: 2.5 })
    );
  });
});
