import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Appraisal } from '@/engine/market/appraisal';
import { configureClipboard } from '@/lib/clipboard';
import { TRADE_HUBS } from '@/market/hubs';
import { AppraisalPanel } from './AppraisalPanel';
import type { AppraisalController } from './useAppraisal';
import type { AppraisalOutcome, HubComparisonRow } from './appraisalData';

function controller(overrides: Partial<AppraisalController> = {}): AppraisalController {
  return {
    text: '',
    setText: vi.fn(),
    appraiseText: vi.fn(),
    result: null,
    compare: null,
    loading: false,
    failed: false,
    canAppraise: false,
    appraise: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

const APPRAISAL: Appraisal = {
  rows: [
    {
      typeId: 2048,
      name: 'Damage Control II',
      quantity: 3,
      buyEach: 448_650,
      sellEach: 460_800,
      buyTotal: 1_345_950,
      sellTotal: 1_382_400,
    },
    {
      typeId: 999,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buyEach: null,
      sellEach: 1_000,
      buyTotal: null,
      sellTotal: 4_000,
    },
  ],
  totals: {
    buy: 1_345_950,
    sell: 1_386_400,
    spread: 40_450,
    unpricedRows: 1,
    refine: 0,
    refineUnpricedRows: 0,
    cheapestBuy: 0,
    cheapestBuyViaLp: 0,
  },
};

function outcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
  return { appraisal: APPRAISAL, unmatched: [], implantBonusPct: 0, ...overrides };
}

/**
 * Every priced row carries a Market link and an `ItemContextMenu`, both of
 * which call `useLocation`/`useNavigate` unconditionally — so any render that
 * produces rows needs a Router ancestor, same as `VariationsTable.test.tsx`.
 */
function renderPanel(
  props: Partial<Parameters<typeof AppraisalPanel>[0]> = {},
  { route = '/market?section=appraisal&hub=jita' }: { route?: string } = {}
) {
  const onPricePercentChange = vi.fn();
  const onAddToQuickbar = vi.fn();
  const onShowInfo = vi.fn();
  const onRequestBlueprintCatalog = vi.fn();
  render(
    <MemoryRouter initialEntries={[route]}>
      <AppraisalPanel
        controller={controller()}
        pricePercent={90}
        onPricePercentChange={onPricePercentChange}
        hub={TRADE_HUBS[0]}
        blueprintCatalog={null}
        onRequestBlueprintCatalog={onRequestBlueprintCatalog}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable
        onShowInfo={onShowInfo}
        {...props}
      />
    </MemoryRouter>
  );
  return { onPricePercentChange, onAddToQuickbar, onShowInfo, onRequestBlueprintCatalog };
}

describe('AppraisalPanel', () => {
  it('prompts for a paste before anything has been appraised', () => {
    renderPanel();
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();
  });

  it('renders a priced row with both sides', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const row = screen.getByRole('row', { name: /Damage Control II/ });
    // Totals render as shorthand (#947); the exact figure is the accessible name.
    expect(within(row).getByLabelText('1,345,950 ISK')).toBeInTheDocument();
    expect(within(row).getByLabelText('1,382,400 ISK')).toBeInTheDocument();
  });

  /** A null price is "nobody is trading this", not "this is free". */
  it('shows a dash, not a zero, where a side has no orders', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const row = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('says how many rows were left out of a total', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByText(/1 item has no orders on one side at this hub/)).toBeInTheDocument();
  });

  // The reflow itself is CSS behind a media query and is measured in
  // `e2e/marketAppraisalNarrow.spec.ts`; this only guards the opt-in from
  // being dropped, the same pairing `PriceHistoryChart.test.tsx` asserts.
  it('pairs the figures two to a row in its stacked cards', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByRole('table', { name: 'Appraisal' })).toHaveClass('dt-stack-2col');
  });

  describe('Compare hubs', () => {
    const COMPARE_ROWS: HubComparisonRow[] = TRADE_HUBS.map((hub, index) => ({
      hub,
      buy: index === 0 ? null : 1_000 * (index + 1),
      sell: 2_000 * (index + 1),
    }));

    async function compareCards() {
      const toggle = await screen.findByRole('button', { name: /hub comparison/i });
      if (toggle.getAttribute('aria-label')?.startsWith('Show')) {
        await userEvent.click(toggle);
      }
      return screen.findByRole('list', { name: 'Compare hubs' });
    }

    /** The card for one hub, found by the hub name it is titled with. */
    function hubCard(list: HTMLElement, systemName: string): HTMLElement {
      const card = within(list)
        .getAllByRole('listitem')
        .find((item) => within(item).queryByText(systemName) !== null);
      if (card === undefined) throw new Error(`No card for ${systemName}`);
      return card;
    }

    it('is absent until something has been appraised', () => {
      renderPanel({ controller: controller({ result: null, compare: null }) });
      expect(screen.queryByText('Compare hubs')).not.toBeInTheDocument();
    });

    it('gives all 5 Trade Hubs a card, collapsed by default', async () => {
      renderPanel({ controller: controller({ result: outcome(), compare: COMPARE_ROWS }) });
      expect(screen.getByText('Compare hubs')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Compare hubs' })).not.toBeInTheDocument();

      const list = await compareCards();
      expect(within(list).getAllByRole('listitem')).toHaveLength(TRADE_HUBS.length);
      for (const hub of TRADE_HUBS) {
        // Both sides are labelled on every card, so the buy/sell figures can
        // never be told apart by position alone.
        const card = hubCard(list, hub.systemName);
        expect(within(card).getByText('Sell total')).toBeInTheDocument();
        expect(within(card).getByText('Buy total')).toBeInTheDocument();
      }
    });

    it('is expanded on mount when opened via defaultCompareExpanded (issue #726)', () => {
      renderPanel({
        controller: controller({ result: outcome(), compare: COMPARE_ROWS }),
        defaultCompareExpanded: true,
      });
      expect(screen.getByRole('list', { name: 'Compare hubs' })).toBeInTheDocument();
    });

    it('shows a dash, not a zero, for a hub with no orders on a side', async () => {
      renderPanel({ controller: controller({ result: outcome(), compare: COMPARE_ROWS }) });
      const list = await compareCards();
      expect(within(hubCard(list, TRADE_HUBS[0].systemName)).getByText('—')).toBeInTheDocument();
    });

    /**
     * The clipboard gets the *exact* figure, never the "4.0K" shorthand the
     * card renders — a pasted appraisal total that had been rounded for
     * display would be wrong wherever it landed.
     */
    it('copies a total in full when it is clicked, and says so', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      renderPanel({ controller: controller({ result: outcome(), compare: COMPARE_ROWS }) });
      const list = await compareCards();
      const amarr = hubCard(list, TRADE_HUBS[1].systemName);

      // COMPARE_ROWS indexes Amarr at 1: sell 4,000, buy 2,000.
      await userEvent.click(within(amarr).getByRole('button', { name: 'Copy 4,000 ISK' }));
      expect(written).toEqual(['4,000']);
      expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');

      await userEvent.click(within(amarr).getByRole('button', { name: 'Copy 2,000 ISK' }));
      expect(written).toEqual(['4,000', '2,000']);

      configureClipboard(null);
    });

    it('leaves a hub with no orders on a side unclickable', async () => {
      renderPanel({ controller: controller({ result: outcome(), compare: COMPARE_ROWS }) });
      const list = await compareCards();
      // Jita's buy is null here, so only its sell total is a copy target.
      expect(within(hubCard(list, TRADE_HUBS[0].systemName)).getAllByRole('button')).toHaveLength(
        1
      );
    });
  });

  describe('refine-then-sell (issue #672)', () => {
    function refineOutcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
      return {
        appraisal: {
          rows: [
            {
              typeId: 1230,
              name: 'Veldspar',
              quantity: 1000,
              buyEach: 5,
              sellEach: 6,
              buyTotal: 5_000,
              sellTotal: 6_000,
              refineTotal: 8_000,
              refinePricedAll: true,
              refineUnitsLeftOver: 0,
            },
            {
              typeId: 2048,
              name: 'Damage Control II',
              quantity: 3,
              buyEach: 448_650,
              sellEach: 460_800,
              buyTotal: 1_345_950,
              sellTotal: 1_382_400,
            },
          ],
          totals: {
            buy: 1_350_950,
            sell: 1_388_400,
            spread: 37_450,
            unpricedRows: 0,
            refine: 8_000,
            refineUnpricedRows: 0,
            cheapestBuy: 0,
            cheapestBuyViaLp: 0,
          },
        },
        unmatched: [],
        implantBonusPct: 0,
        ...overrides,
      };
    }

    it('adds a refine column and total when a row carries refine data', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const veldsparRow = screen.getByRole('row', { name: /Veldspar/ });
      expect(within(veldsparRow).getByLabelText('8,000 ISK')).toBeInTheDocument();
      expect(screen.getAllByText('Refine total').length).toBeGreaterThan(0);
    });

    it('flags the refine value with a dash on a row with no reprocessing data', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const dcuRow = screen.getByRole('row', { name: /Damage Control II/ });
      expect(within(dcuRow).getByText('—')).toBeInTheDocument();
    });

    it('marks a partially priced refine value', () => {
      const partial = refineOutcome();
      partial.appraisal.rows[0].refinePricedAll = false;
      renderPanel({ controller: controller({ result: partial }) });
      const veldsparRow = screen.getByRole('row', { name: /Veldspar/ });
      expect(within(veldsparRow).getByTitle(/no price at this hub/)).toBeInTheDocument();
    });

    it('omits the refine column entirely with no active Character', () => {
      renderPanel({ controller: controller({ result: outcome() }) });
      expect(screen.queryAllByText('Refine total')).toHaveLength(0);
    });

    /**
     * Regression for issue #1048: a quantity that is not whole batches left
     * the refine side charged for units it never refined, so a row that
     * refines for more than it sells for was highlighted as a sell. The
     * leftover units are still there to sell, and now count.
     */
    it('highlights refine when the batches plus the leftover beat selling it all', () => {
      const partBatch = refineOutcome();
      partBatch.appraisal.rows[0] = {
        ...partBatch.appraisal.rows[0],
        name: 'Mercoxit III-Grade',
        quantity: 999,
        buyEach: 16_000,
        buyTotal: 15_984_000,
        sellEach: 17_000,
        sellTotal: 16_983_000,
        refineTotal: 15_436_890,
        refineUnitsLeftOver: 99,
      };
      renderPanel({ controller: controller({ result: partBatch }) });
      const oreRow = screen.getByRole('row', { name: /Mercoxit III-Grade/ });
      const refineCell = within(oreRow).getByLabelText('15,436,890 ISK').parentElement;
      const buyCell = within(oreRow).getByLabelText('15,984,000 ISK').parentElement;
      expect(refineCell?.className).toContain('text-accent');
      expect(buyCell?.className).not.toContain('text-accent');
    });

    /**
     * Regression: the buy-total highlight must never fire on a row with
     * nothing to compare against — a row with no refine value is not a
     * winner just because `refineBeatsSellAsIs` defaults to false for it.
     */
    it('does not bold the buy total on a row with no refine comparison', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const dcuRow = screen.getByRole('row', { name: /Damage Control II/ });
      // The highlight lives on the cell wrapper around the shorthand figure.
      const buyCell = within(dcuRow).getByLabelText('1,345,950 ISK').parentElement;
      expect(buyCell?.className).not.toContain('text-accent');
    });
  });

  describe('LP store acquisition', () => {
    function lpOutcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
      return {
        appraisal: {
          rows: [
            {
              typeId: 33468,
              name: 'Astero',
              quantity: 1,
              buyEach: 60_000_000,
              sellEach: 95_000_000,
              buyTotal: 60_000_000,
              sellTotal: 95_000_000,
              lpCorporationId: 1000125,
              lpCorpName: 'Sisters of EVE',
              lpCost: 400_000,
              lpIskCost: 850_000,
              lpAffordable: true,
            },
            {
              typeId: 2048,
              name: 'Damage Control II',
              quantity: 3,
              buyEach: 448_650,
              sellEach: 460_800,
              buyTotal: 1_345_950,
              sellTotal: 1_382_400,
            },
          ],
          totals: {
            buy: 60_000_000,
            sell: 1_477_400,
            spread: -58_522_600,
            unpricedRows: 0,
            refine: 0,
            refineUnpricedRows: 0,
            cheapestBuy: 2_232_400,
            cheapestBuyViaLp: 1,
          },
        },
        unmatched: [],
        implantBonusPct: 0,
        ...overrides,
      };
    }

    it('adds an LP store column and cheapest-total chip when a row has an LP option', () => {
      renderPanel({ controller: controller({ result: lpOutcome() }) });
      const asteroRow = screen.getByRole('row', { name: /Astero/ });
      const link = within(asteroRow).getByRole('link', { name: /Sisters of EVE/ });
      expect(link).toHaveAttribute('href', '/wallet/loyalty/1000125');
      expect(screen.getAllByText('Cheapest total').length).toBeGreaterThan(0);
    });

    it("never spells out the corp name as plain cell text — only the icon link's accessible name", () => {
      renderPanel({ controller: controller({ result: lpOutcome() }) });
      const asteroRow = screen.getByRole('row', { name: /Astero/ });
      // Keeps the column narrow at any width: the full breakdown lives on the
      // link's label/tooltip, never as a second visible text node in the cell.
      expect(within(asteroRow).queryByText('Sisters of EVE')).not.toBeInTheDocument();
    });

    it('omits the LP column entirely with no LP option on any row', () => {
      renderPanel({ controller: controller({ result: outcome() }) });
      expect(screen.queryAllByText('Cheapest total')).toHaveLength(0);
    });

    it('marks an unaffordable LP option rather than hiding it', () => {
      const unaffordable = lpOutcome();
      unaffordable.appraisal.rows[0].lpAffordable = false;
      renderPanel({ controller: controller({ result: unaffordable }) });
      const asteroRow = screen.getByRole('row', { name: /Astero/ });
      expect(within(asteroRow).getByTitle(/does not hold enough LP/)).toBeInTheDocument();
    });

    it('shows a dash on a row with no LP option, when the column is present', () => {
      renderPanel({ controller: controller({ result: lpOutcome() }) });
      const dcuRow = screen.getByRole('row', { name: /Damage Control II/ });
      expect(within(dcuRow).getByText('—')).toBeInTheDocument();
    });
  });

  it('reports unmatched lines beside the paste box, by line number', () => {
    renderPanel({
      controller: controller({
        result: outcome({ unmatched: [{ name: 'Nanite Repair Past', lines: [3, 7] }] }),
      }),
    });
    expect(screen.getByText('1 line not matched')).toBeInTheDocument();
    expect(screen.getByText('line 3, 7 · Nanite Repair Past')).toBeInTheDocument();
  });

  it('names the hub and percentage the figures are quoted at', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByText('Jita')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('commits a valid percentage as it is typed', async () => {
    const user = userEvent.setup();
    const { onPricePercentChange } = renderPanel();
    const field = screen.getByLabelText('Price %');
    await user.clear(field);
    await user.type(field, '85');
    expect(onPricePercentChange).toHaveBeenLastCalledWith(85);
  });

  /**
   * Clearing the box to retype must not snap the value back — a field that
   * rewrites itself mid-edit cannot be edited.
   */
  it('does not commit an empty or out-of-range percentage', async () => {
    const user = userEvent.setup();
    const { onPricePercentChange } = renderPanel();
    const field = screen.getByLabelText('Price %');
    await user.clear(field);
    expect(onPricePercentChange).not.toHaveBeenCalled();
    await user.type(field, '99999');
    expect(onPricePercentChange).not.toHaveBeenCalledWith(99999);
  });

  it('appraises on the button, and only with something to appraise', async () => {
    const user = userEvent.setup();
    const appraise = vi.fn();
    renderPanel({ controller: controller({ text: 'Tritanium 5', canAppraise: true, appraise }) });
    await user.click(screen.getByRole('button', { name: 'Appraise' }));
    expect(appraise).toHaveBeenCalledOnce();
  });

  it('disables Appraise with an empty box', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Appraise' })).toBeDisabled();
  });

  it('says so when nothing in the paste named a real item', () => {
    renderPanel({
      controller: controller({
        result: outcome({
          appraisal: {
            rows: [],
            totals: {
              buy: 0,
              sell: 0,
              spread: 0,
              unpricedRows: 0,
              refine: 0,
              refineUnpricedRows: 0,
              cheapestBuy: 0,
              cheapestBuyViaLp: 0,
            },
          },
          unmatched: [{ name: 'Nope', lines: [1] }],
        }),
      }),
    });
    expect(screen.getByText('No items recognised')).toBeInTheDocument();
  });

  it('reports a catalogue that would not load', () => {
    renderPanel({ controller: controller({ failed: true }) });
    expect(screen.getByText("Couldn't load the market catalogue")).toBeInTheDocument();
  });
});

describe('AppraisalPanel — the row as an item', () => {
  /**
   * The link deliberately carries no `section`: that absence is what
   * `Market.tsx` reads as an incoming item link and answers by switching to
   * the Browser. Carrying `section=appraisal` through would land the pilot
   * back on the tab they clicked from, which looks like a dead link.
   */
  it('links an item name into the Market Browser, keeping the hub it was priced at', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const link = screen.getByRole('link', { name: 'Damage Control II' });
    expect(link).toHaveAttribute('href', '/market?type=2048&hub=jita');
  });

  it('falls back to a bare item link when the URL names no location', () => {
    renderPanel({ controller: controller({ result: outcome() }) }, { route: '/market' });
    expect(screen.getByRole('link', { name: 'Damage Control II' })).toHaveAttribute(
      'href',
      '/market?type=2048'
    );
  });

  it('carries the item context menu on every priced row', async () => {
    const { onShowInfo } = renderPanel({ controller: controller({ result: outcome() }) });
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  /** Without this the Build Plan action sits on "Checking…" forever. */
  it('asks for the blueprint catalog the first time a row menu opens', () => {
    const { onRequestBlueprintCatalog } = renderPanel({
      controller: controller({ result: outcome() }),
    });
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));
    expect(onRequestBlueprintCatalog).toHaveBeenCalled();
  });
});
