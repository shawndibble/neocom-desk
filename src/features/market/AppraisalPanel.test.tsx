import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Appraisal } from '@/engine/market/appraisal';
import { AppraisalPanel } from './AppraisalPanel';
import type { AppraisalController } from './useAppraisal';
import type { AppraisalOutcome } from './appraisalData';

function controller(overrides: Partial<AppraisalController> = {}): AppraisalController {
  return {
    text: '',
    setText: vi.fn(),
    result: null,
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
  },
};

function outcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
  return { appraisal: APPRAISAL, unmatched: [], ...overrides };
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
        hubName="Jita"
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
    expect(within(row).getByText('1,345,950')).toBeInTheDocument();
    expect(within(row).getByText('1,382,400')).toBeInTheDocument();
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
          },
        },
        unmatched: [],
        ...overrides,
      };
    }

    it('adds a refine column and total when a row carries refine data', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const veldsparRow = screen.getByRole('row', { name: /Veldspar/ });
      expect(within(veldsparRow).getByText('8,000')).toBeInTheDocument();
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
     * Regression: the buy-total highlight must never fire on a row with
     * nothing to compare against — a row with no refine value is not a
     * winner just because `refineBeatsSellAsIs` defaults to false for it.
     */
    it('does not bold the buy total on a row with no refine comparison', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const dcuRow = screen.getByRole('row', { name: /Damage Control II/ });
      const buyCell = within(dcuRow).getByText('1,345,950');
      expect(buyCell.className).not.toContain('text-accent');
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
