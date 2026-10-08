import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Appraisal } from '@/engine/market/appraisal';
import { ZERO_STANDINGS } from '@/engine/market/standings';
import { configureClipboard } from '@/lib/clipboard';
import { TRADE_HUBS } from '@/market/hubs';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_REGISTRY } from '@/esi/registry';
import { resetShareLinksForTests } from '@/features/share/shareStore';
import { AppraisalPanel } from './AppraisalPanel';
import { DEFAULT_APPRAISAL_OWNED_PREF, useAppraisalOwnedPref } from './appraisalOwnedPref';
import { useRecentAppraisals } from './appraisalRecent';
import { useHaulingCargo } from './haulingCargo';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import type { AppraisalController } from './useAppraisal';
import type { AppraisalOutcome, HubComparisonRow } from './appraisalData';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => true,
}));
// One layer under the share store, so its "same appraisal, same link" reuse
// runs for real: Firestore's write and the Firebase session are the seams.
const setDoc = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('firebase/firestore/lite', () => ({
  setDoc,
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  serverTimestamp: () => 'SERVER_TIME',
  Timestamp: { fromMillis: (millis: number) => ({ millis }) },
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
const loadAllCharactersAssets = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/assets', () => ({ loadAllCharactersAssets }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => 'char:7') }));

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
      volume: 15,
    },
    {
      typeId: 999,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buyEach: null,
      sellEach: 1_000,
      buyTotal: null,
      sellTotal: 4_000,
      volume: 1_240.5,
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
    volume: 1_255.5,
    volumeUnknownRows: 0,
  },
  items: [],
};

function outcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
  return {
    appraisal: APPRAISAL,
    unmatched: [],
    implantBonusPct: 0,
    refinesOreOrIce: false,
    accountingLevel: null,
    brokerRelationsLevel: null,
    ...overrides,
  };
}

/**
 * Every priced row carries a Market link and an `ItemContextMenu`, both of
 * which call `useLocation`/`useNavigate` unconditionally — so any render that
 * produces rows needs a Router ancestor, same as `VariationsTable.test.tsx`.
 */
function renderPanel(
  props: Partial<Parameters<typeof AppraisalPanel>[0]> = {},
  { route = '/market/appraisal?hub=jita' }: { route?: string } = {}
) {
  const onPricePercentChange = vi.fn();
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={[route]}>
      <FakeItemActions actions={actions}>
        <AppraisalPanel
          controller={controller()}
          pricePercent={90}
          onPricePercentChange={onPricePercentChange}
          hub={TRADE_HUBS[0]}
          standing={ZERO_STANDINGS}
          characterId={1}
          {...props}
        />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { onPricePercentChange, actions };
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
    expect(within(row).getByText('1,345,950 ISK', { selector: '.sr-only' })).toBeInTheDocument();
    expect(within(row).getByText('1,382,400 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  /** A null price is "nobody is trading this", not "this is free". */
  it('shows a dash, not a zero, where a side has no orders', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const row = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  describe('volume (issue #2337)', () => {
    it('shows each row’s m³ and a Volume tile', () => {
      renderPanel({ controller: controller({ result: outcome() }) });
      expect(screen.getByRole('columnheader', { name: /Volume \(m³\)/ })).toBeInTheDocument();
      const row = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
      expect(within(row).getByText('1,240.5')).toBeInTheDocument();
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('1,255.5 m³')).toBeInTheDocument();
    });

    it('shows an unknown volume as a dash and marks the total partial', () => {
      const partial: Appraisal = {
        ...APPRAISAL,
        rows: APPRAISAL.rows.map((row) => (row.typeId === 999 ? { ...row, volume: null } : row)),
        totals: { ...APPRAISAL.totals, volume: 15, volumeUnknownRows: 1 },
      };
      renderPanel({ controller: controller({ result: outcome({ appraisal: partial }) }) });
      const row = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
      expect(within(row).getAllByText('—')).toHaveLength(3);
      expect(screen.getByText('≈ 15 m³')).toBeInTheDocument();
    });
  });

  it('says how many rows were left out of a total', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByText(/1 item has no orders on one side at this hub/)).toBeInTheDocument();
  });

  describe('net-of-fees chips (issue #1426)', () => {
    const NET_APPRAISAL: Appraisal = {
      rows: [
        {
          typeId: 2048,
          name: 'Damage Control II',
          quantity: 10,
          buyEach: 1_000,
          sellEach: 1_050,
          buyTotal: 10_000,
          sellTotal: 10_500,
          volume: 1,
        },
        {
          // Unpriced on the buy side only, so it must count toward the list
          // net but drop out of the instant net.
          typeId: 999,
          name: 'Civilian Gatling Railgun',
          quantity: 4,
          buyEach: null,
          sellEach: 1_000,
          buyTotal: null,
          sellTotal: 4_000,
          volume: 1,
        },
      ],
      totals: {
        buy: 10_000,
        sell: 14_500,
        spread: 4_500,
        unpricedRows: 1,
        refine: 0,
        refineUnpricedRows: 0,
        cheapestBuy: 0,
        cheapestBuyViaLp: 0,
        volume: 0,
        volumeUnknownRows: 0,
      },
      items: [
        { typeId: 2048, name: 'Damage Control II', quantity: 10, buy: 1_000, sell: 1_050 },
        { typeId: 999, name: 'Civilian Gatling Railgun', quantity: 4, buy: null, sell: 1_000 },
      ],
    };

    function netOutcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
      return {
        appraisal: NET_APPRAISAL,
        unmatched: [],
        implantBonusPct: 0,
        refinesOreOrIce: false,
        accountingLevel: 0,
        brokerRelationsLevel: 0,
        ...overrides,
      };
    }

    it('renders both net-of-fees chips once the active Character is resolved', () => {
      renderPanel({ controller: controller({ result: netOutcome() }) });
      expect(screen.getByText('Selling now')).toBeInTheDocument();
      expect(screen.getByText('Listing')).toBeInTheDocument();
    });

    it('excludes a row unpriced on the buy side from the instant net only', () => {
      renderPanel({ controller: controller({ result: netOutcome() }) });
      // Only row 1 has a buy price: 10,000 raw total, 7.5% sales tax
      // (Accounting 0) — 10,000 - 750 = 9,250. Row 2 contributes nothing.
      expect(screen.getByText('9,250 ISK', { selector: '.sr-only' })).toBeInTheDocument();
    });

    it('never shows the net chips while the active Character’s skills are still loading', () => {
      renderPanel({
        controller: controller({
          result: netOutcome({ accountingLevel: null, brokerRelationsLevel: null }),
        }),
      });
      expect(screen.queryByText('Selling now')).not.toBeInTheDocument();
      expect(screen.queryByText('Listing')).not.toBeInTheDocument();
    });

    it('notes the net chips are always priced at 100% market when Price % differs (issue #1748)', () => {
      renderPanel({ controller: controller({ result: netOutcome() }) }); // default pricePercent: 90
      expect(screen.getByText(/always priced at 100% market/i)).toBeInTheDocument();
    });

    it('hides the 100%-market note once Price % is already 100 (issue #1748)', () => {
      renderPanel({ pricePercent: 100, controller: controller({ result: netOutcome() }) });
      expect(screen.queryByText(/always priced at 100% market/i)).not.toBeInTheDocument();
    });

    it('wraps whole chips in the totals strip rather than scrolling sideways', () => {
      renderPanel({ controller: controller({ result: netOutcome() }) });
      const strip = screen.getByText('Selling now').closest('.flex-wrap');
      expect(strip).not.toBeNull();
      expect(strip).not.toHaveClass('overflow-x-auto');
    });

    describe('Character details assumption note (issue #1526)', () => {
      const STANDINGS_SCOPE = ESI_REGISTRY.getCharacterStandings.scope;

      async function seedGrant(scopes: readonly string[]): Promise<void> {
        await db.tokens.put({
          characterId: 7,
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 60_000,
          scopes: [...scopes],
        });
      }

      beforeEach(() => {
        useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
      });

      afterEach(async () => {
        await db.tokens.clear();
      });

      it('shows the note when the broker fee is quoted without the Character details scope', async () => {
        await seedGrant([]);
        renderPanel({ controller: controller({ result: netOutcome() }) });

        expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();
      });

      it('hides the note once Character details is granted', async () => {
        await seedGrant([STANDINGS_SCOPE]);
        renderPanel({ controller: controller({ result: netOutcome() }) });

        await waitFor(() => {
          expect(screen.queryByText('Assumes base standings')).not.toBeInTheDocument();
        });
      });

      it('hides the note while there is no net figure to annotate', async () => {
        await seedGrant([]);
        renderPanel({
          controller: controller({
            result: netOutcome({ accountingLevel: null, brokerRelationsLevel: null }),
          }),
        });

        await waitFor(() => {
          expect(screen.queryByText('Assumes base standings')).not.toBeInTheDocument();
        });
      });
    });
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
              volume: 1,
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
              volume: 1,
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
            volume: 0,
            volumeUnknownRows: 0,
          },
          items: [],
        },
        unmatched: [],
        implantBonusPct: 0,
        refinesOreOrIce: false,
        accountingLevel: null,
        brokerRelationsLevel: null,
        ...overrides,
      };
    }

    it('adds a refine column and total when a row carries refine data', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const veldsparRow = screen.getByRole('row', { name: /Veldspar/ });
      expect(
        within(veldsparRow).getByText('8,000 ISK', { selector: '.sr-only' })
      ).toBeInTheDocument();
      expect(screen.getAllByText('Refine total').length).toBeGreaterThan(0);
    });

    it('flags the refine value with a dash on a row with no reprocessing data', () => {
      renderPanel({ controller: controller({ result: refineOutcome() }) });
      const dcuRow = screen.getByRole('row', { name: /Damage Control II/ });
      expect(within(dcuRow).getByText('—')).toBeInTheDocument();
    });

    it('marks a partially priced refine value', async () => {
      const partial = refineOutcome();
      partial.appraisal.rows[0].refinePricedAll = false;
      renderPanel({ controller: controller({ result: partial }) });
      const veldsparRow = screen.getByRole('row', { name: /Veldspar/ });
      await userEvent.hover(within(veldsparRow).getByText('*'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(/no price at this hub/);
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
        volume: 1,
        refineTotal: 15_436_890,
        refineUnitsLeftOver: 99,
      };
      renderPanel({ controller: controller({ result: partBatch }) });
      const oreRow = screen.getByRole('row', { name: /Mercoxit III-Grade/ });
      const refineCell = within(oreRow).getByText('15,436,890 ISK', { selector: '.sr-only' })
        .parentElement?.parentElement;
      const buyCell = within(oreRow).getByText('15,984,000 ISK', { selector: '.sr-only' })
        .parentElement?.parentElement;
      expect(refineCell?.className).toContain('text-isk-pos');
      expect(buyCell?.className).not.toContain('text-isk-pos');
    });

    it('explains the leftover that tips refine over the buy total', async () => {
      const partBatch = refineOutcome();
      partBatch.appraisal.rows[0] = {
        ...partBatch.appraisal.rows[0],
        name: 'Mercoxit III-Grade',
        quantity: 999,
        buyEach: 16_000,
        buyTotal: 15_984_000,
        refineTotal: 15_436_890,
        refineUnitsLeftOver: 99,
      };
      renderPanel({ controller: controller({ result: partBatch }) });
      const oreRow = screen.getByRole('row', { name: /Mercoxit III-Grade/ });
      await userEvent.hover(within(oreRow).getByText('!'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(/99 units are too few/);
    });

    it('shows no leftover mark when refine wins without the leftover', () => {
      const clean = refineOutcome();
      clean.appraisal.rows[0] = {
        ...clean.appraisal.rows[0],
        name: 'Mercoxit III-Grade',
        buyTotal: 1_000,
        refineTotal: 2_000,
        refineUnitsLeftOver: 5,
      };
      renderPanel({ controller: controller({ result: clean }) });
      const oreRow = screen.getByRole('row', { name: /Mercoxit III-Grade/ });
      expect(within(oreRow).queryByText('!')).not.toBeInTheDocument();
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
      const buyCell = within(dcuRow).getByText('1,345,950 ISK', { selector: '.sr-only' })
        .parentElement?.parentElement;
      expect(buyCell?.className).not.toContain('text-isk-pos');
    });

    describe('Character details implant note (issue #1588)', () => {
      const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;
      const NOTE = 'Assumes no implants';

      async function seedGrant(scopes: readonly string[]): Promise<void> {
        await db.tokens.put({
          characterId: 7,
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 60_000,
          scopes: [...scopes],
        });
      }

      beforeEach(() => {
        useActiveCharacter.setState({ activeCharacterId: 7, hydrated: true });
      });

      afterEach(async () => {
        await db.tokens.clear();
      });

      it('shows the note when ore is refined without the Character details scope', async () => {
        await seedGrant([]);
        renderPanel({
          controller: controller({ result: refineOutcome({ refinesOreOrIce: true }) }),
        });

        expect(await screen.findByText(NOTE)).toBeInTheDocument();
      });

      it('hides the note once Character details is granted', async () => {
        await seedGrant([IMPLANTS_SCOPE]);
        renderPanel({
          controller: controller({ result: refineOutcome({ refinesOreOrIce: true }) }),
        });

        await waitFor(() => expect(screen.queryByText(NOTE)).not.toBeInTheDocument());
      });

      it('hides the note on a scrap-only refine — no refining implant touches it', async () => {
        await seedGrant([]);
        renderPanel({ controller: controller({ result: refineOutcome() }) });

        await waitFor(() => expect(screen.queryByText(NOTE)).not.toBeInTheDocument());
      });
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
              volume: 1,
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
              volume: 1,
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
            volume: 0,
            volumeUnknownRows: 0,
          },
          items: [],
        },
        unmatched: [],
        implantBonusPct: 0,
        refinesOreOrIce: false,
        accountingLevel: null,
        brokerRelationsLevel: null,
        ...overrides,
      };
    }

    it('adds an LP store column and cheapest-total chip when a row has an LP option', () => {
      renderPanel({ controller: controller({ result: lpOutcome() }) });
      const asteroRow = screen.getByRole('row', { name: /Astero/ });
      const link = within(asteroRow).getByRole('link', { name: /Sisters of EVE/ });
      expect(link).toHaveAttribute('href', '/market/lp-store/1000125');
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

    it('marks an unaffordable LP option rather than hiding it', async () => {
      const unaffordable = lpOutcome();
      unaffordable.appraisal.rows[0].lpAffordable = false;
      renderPanel({ controller: controller({ result: unaffordable }) });
      const asteroRow = screen.getByRole('row', { name: /Astero/ });
      await userEvent.hover(within(asteroRow).getByText('*'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(/does not hold enough LP/);
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
              volume: 0,
              volumeUnknownRows: 0,
            },
            items: [],
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

describe('AppraisalPanel — Copy lists', () => {
  // Rows are Price-Percent-scaled (90%); the lists read `items`, unscaled.
  const LISTS_OUTCOME = outcome({
    appraisal: {
      ...APPRAISAL,
      items: [
        { typeId: 2048, name: 'Damage Control II', quantity: 3, buy: 498_500, sell: 512_000 },
        { typeId: 999, name: 'Civilian Gatling Railgun', quantity: 4, buy: null, sell: 1_000 },
        // The undercut (150) is no better than the buy order, so it sells now.
        { typeId: 555, name: 'Cheap Widget', quantity: 7, buy: 200, sell: 151 },
      ],
    },
  });

  function menuButton() {
    return screen.getByRole('button', { name: /Appraisal/ });
  }

  async function copy(name: RegExp | string) {
    await userEvent.click(menuButton());
    await userEvent.click(await screen.findByRole('menuitem', { name }));
  }

  it('offers the copy lists and Export in one menu, with no separate Copy button', async () => {
    renderPanel({ controller: controller({ result: LISTS_OUTCOME }) });
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    await userEvent.click(menuButton());
    expect(await screen.findByRole('menuitem', { name: /^List at undercut/ })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /^Sell now/ })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /Export table/ })).toBeInTheDocument();
  });

  it('disables a list with nothing in it', async () => {
    renderPanel({
      controller: controller({ result: outcome({ appraisal: { ...APPRAISAL, items: [] } }) }),
    });
    await userEvent.click(menuButton());
    for (const name of [/^Sell now/, /^List at undercut/, /^Refine/, /^Multibuy/]) {
      expect(await screen.findByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }
  });

  it('copies one name/price line per listable item, no quantity, ignoring Price Percent', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    renderPanel({ controller: controller({ result: LISTS_OUTCOME }) });
    await copy(/^List at undercut/);
    expect(written).toEqual(['Damage Control II\t511900\nCivilian Gatling Railgun\t999.90']);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'List at undercut copied · 2 items'
    );
    configureClipboard(null);
  });

  it('copies name and quantity for what sells into a buy order now', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    renderPanel({ controller: controller({ result: LISTS_OUTCOME }) });
    await copy(/^Sell now/);
    expect(written).toEqual(['Cheap Widget\t7']);
    configureClipboard(null);
  });
});

describe('AppraisalPanel — Columns', () => {
  it('hides an optional column once toggled off, and shows it again', async () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByRole('columnheader', { name: 'Buy each' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Buy each' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader', { name: 'Buy each' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Buy each' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('columnheader', { name: 'Buy each' })).toBeInTheDocument();
  });

  it('offers Refine total only once a row actually carries refine data', async () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await screen.findByRole('menuitemcheckbox', { name: 'Buy each' });
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Refine total' })
    ).not.toBeInTheDocument();
  });
});

describe('AppraisalPanel — the row as an item', () => {
  /**
   * The link points at `/market/browser` directly (ADR 0015) — the tab is
   * part of the path now, so there is no `section` left to carry through
   * that would otherwise land the pilot back on the tab they clicked from.
   */
  it('links an item name into the Market Browser, keeping the hub it was priced at', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const link = screen.getByRole('link', { name: 'Damage Control II' });
    expect(link).toHaveAttribute('href', '/market/browser?type=2048&hub=jita');
  });

  it('falls back to a bare item link when the URL names no location', () => {
    renderPanel({ controller: controller({ result: outcome() }) }, { route: '/market' });
    expect(screen.getByRole('link', { name: 'Damage Control II' })).toHaveAttribute(
      'href',
      '/market/browser?type=2048'
    );
  });

  it('carries the item context menu on every priced row', async () => {
    const { actions } = renderPanel({ controller: controller({ result: outcome() }) });
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  /** Without this the Build Plan action sits on "Checking…" forever. */
  it('asks for the blueprint catalog the first time a row menu opens', () => {
    const { actions } = renderPanel({
      controller: controller({ result: outcome() }),
    });
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));
    expect(actions.requestBlueprints).toHaveBeenCalled();
  });

  describe('Share', () => {
    const SHARED = outcome({
      appraisal: {
        ...APPRAISAL,
        items: [
          { typeId: 2048, name: 'Damage Control II', quantity: 3, buy: 448_650, sell: 460_800 },
        ],
      },
    });

    afterEach(() => {
      configureClipboard(null);
      setDoc.mockClear();
      resetShareLinksForTests();
    });

    /** The `shares/<id>` doc each stored share was written to, in order. */
    function storedPaths(): string[] {
      return setDoc.mock.calls
        .map((call) => (call as unknown[])[0] as { path: string })
        .map((ref) => ref.path);
    }

    it('stores the appraisal with its prices and copies the short link', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      renderPanel({ controller: controller({ result: SHARED }), characterId: 7 });

      await userEvent.click(screen.getByRole('button', { name: 'Copy Share Link' }));

      await waitFor(() => expect(written).toHaveLength(1));
      expect(written[0]).toMatch(/\/share\/[0-9A-Za-z]{9}$/);
      expect(storedPaths()).toEqual([`shares/${written[0].split('/').pop()}`]);
      expect((setDoc.mock.calls[0] as unknown[])[1]).toMatchObject({
        type: 'appraisal',
        payload: expect.objectContaining({
          hub: TRADE_HUBS[0].id,
          pricePercent: 90,
          items: [
            {
              typeId: 2048,
              name: 'Damage Control II',
              quantity: 3,
              buy: 448_650,
              sell: 460_800,
              unitVolume: null,
            },
          ],
        }),
      });
    });

    it('hands back the same link when the same appraisal is shared again', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      renderPanel({ controller: controller({ result: SHARED }) });
      const share = screen.getByRole('button', { name: 'Copy Share Link' });

      await userEvent.click(share);
      await waitFor(() => expect(written).toHaveLength(1));
      await userEvent.click(share);
      await waitFor(() => expect(written).toHaveLength(2));

      expect(written[1]).toBe(written[0]);
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('shows the link to copy by hand when the copy after saving is refused', async () => {
      configureClipboard(async () => {
        throw new Error('not allowed');
      });
      renderPanel({ controller: controller({ result: SHARED }) });

      await userEvent.click(screen.getByRole('button', { name: 'Copy Share Link' }));

      const field = await screen.findByLabelText('Share Link — works for 7 days');
      expect((field as HTMLInputElement).value).toMatch(/\/share\/[0-9A-Za-z]{9}$/);
    });

    it('copies nothing when the share could not be stored', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      setDoc.mockRejectedValueOnce(new Error('permission-denied'));
      renderPanel({ controller: controller({ result: SHARED }) });

      await userEvent.click(screen.getByRole('button', { name: 'Copy Share Link' }));

      await waitFor(() => expect(setDoc).toHaveBeenCalled());
      expect(written).toEqual([]);
    });

    it('is disabled with no Character to store the share as', () => {
      renderPanel({ controller: controller({ result: SHARED }), characterId: null });
      expect(screen.getByRole('button', { name: 'Copy Share Link' })).toBeDisabled();
    });
  });

  describe('Sell and Buy totals', () => {
    afterEach(() => configureClipboard(null));

    it('read as shorthand only, and copy the full figure on click', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      renderPanel({ controller: controller({ result: outcome() }) });

      const sell = screen.getByRole('button', { name: 'Copy 1.4M ISK (1,386,400)' });
      expect(sell).toHaveTextContent(/^1\.4M$/);
      await userEvent.click(sell);

      expect(written).toEqual(['1,386,400']);
      expect(await screen.findByRole('status')).toHaveTextContent('Copied 1,386,400 ISK');
    });
  });
});

describe('AppraisalPanel — shopping list (#2868)', () => {
  const LIST_OUTCOME = outcome({
    appraisal: {
      ...APPRAISAL,
      items: [
        { typeId: 2048, name: 'Damage Control II', quantity: 3, buy: 498_500, sell: 512_000 },
        { typeId: 999, name: 'Civilian Gatling Railgun', quantity: 4, buy: null, sell: 1_000 },
      ],
    },
  });

  async function seedAssetsGrant() {
    await db.tokens.put({
      characterId: 1,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      scopes: [ESI_REGISTRY.getCharacterAssets.scope],
    });
  }

  beforeEach(() => {
    useAppraisalOwnedPref.setState({ value: DEFAULT_APPRAISAL_OWNED_PREF, hydrated: true });
    useRecentAppraisals.setState({ value: [], hydrated: true });
    useHaulingCargo.setState({ value: null, hydrated: true });
  });

  afterEach(async () => {
    configureClipboard(null);
    await db.tokens.clear();
    await db.settings.clear();
  });

  it("groups the header figures under You get / It's worth / Cargo", () => {
    renderPanel({
      controller: controller({
        result: outcome({ accountingLevel: 0, brokerRelationsLevel: 0 }),
      }),
    });
    const youGet = screen.getByRole('region', { name: 'You get' });
    expect(within(youGet).getByText('Selling now')).toBeInTheDocument();
    expect(within(youGet).getByText('Listing')).toBeInTheDocument();
    const worth = screen.getByRole('region', { name: "It's worth" });
    for (const label of ['Sell total', 'Buy total', 'Spread']) {
      expect(within(worth).getByText(label)).toBeInTheDocument();
    }
    const cargo = screen.getByRole('region', { name: 'Cargo' });
    expect(within(cargo).getByText('Volume')).toBeInTheDocument();
    expect(within(cargo).getByText('Items')).toBeInTheDocument();
  });

  it('emphasises exactly one figure in each header group', () => {
    renderPanel({
      controller: controller({
        result: outcome({ accountingLevel: 0, brokerRelationsLevel: 0 }),
      }),
    });
    for (const region of ['You get', "It's worth", 'Cargo']) {
      expect(
        screen.getByRole('region', { name: region }).querySelectorAll('.text-sm.font-semibold')
      ).toHaveLength(1);
    }
  });

  it('puts the Recent select above the paste box', () => {
    useRecentAppraisals.setState({
      value: [{ text: 'Tritanium 5', savedAt: Date.now() }],
      hydrated: true,
    });
    renderPanel({ controller: controller() });
    const recent = screen.getByRole('combobox', { name: 'Load a recent list' });
    const box = screen.getByRole('textbox');
    expect(recent.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides Recent when nothing was saved', () => {
    renderPanel({ controller: controller() });
    expect(screen.queryByRole('combobox', { name: 'Load a recent list' })).not.toBeInTheDocument();
  });

  it('copies the full multibuy when nothing is subtracted', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    renderPanel({ controller: controller({ result: LIST_OUTCOME }) });
    await userEvent.click(screen.getByRole('button', { name: /Appraisal/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Multibuy/ }));
    expect(written).toEqual(['Damage Control II\t3\nCivilian Gatling Railgun\t4']);
  });

  it('remembers the Minus owned checkbox', async () => {
    await seedAssetsGrant();
    loadAllCharactersAssets.mockResolvedValue({ entries: [], skipped: [] });
    renderPanel({ controller: controller({ result: LIST_OUTCOME }) });
    const box = await screen.findByRole('checkbox', { name: 'Minus what I own' });
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.click(box);
    await waitFor(async () =>
      expect((await db.settings.get('appraisalMinusOwned'))?.value).toMatchObject({ enabled: true })
    );
  });

  it('disables Minus owned with a grant note without the assets permission', async () => {
    await db.tokens.put({
      characterId: 1,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      scopes: [],
    });
    renderPanel({ controller: controller({ result: LIST_OUTCOME }) });
    expect(await screen.findByText('Grant Assets permission')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Minus what I own' })).toBeDisabled();
  });

  it('shows Need with owned beneath, dims covered lines, and copies net quantities', async () => {
    await seedAssetsGrant();
    useAppraisalOwnedPref.setState({ value: { enabled: true, stationId: null }, hydrated: true });
    loadAllCharactersAssets.mockResolvedValue({
      entries: [
        {
          characterId: 1,
          name: 'A',
          truncated: false,
          assets: [
            {
              type_id: 2048,
              quantity: 1,
              location_id: TRADE_HUBS[0].stationId,
              location_type: 'station',
            },
            {
              type_id: 999,
              quantity: 9,
              location_id: TRADE_HUBS[0].stationId,
              location_type: 'station',
            },
          ],
        },
      ],
      skipped: [],
    });
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    renderPanel({ controller: controller({ result: LIST_OUTCOME }) });
    expect(await screen.findByRole('columnheader', { name: 'Need' })).toBeInTheDocument();
    expect(screen.getByText(/Minus owned ·/)).toBeInTheDocument();
    const covered = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
    expect(covered).toHaveClass('opacity-50');
    expect(within(covered).getByText('4 owned')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Appraisal/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Multibuy/ }));
    expect(written).toEqual(['Damage Control II\t2']);
  });

  it('reloads a Recent paste', async () => {
    useRecentAppraisals.setState({
      value: [{ text: 'Tritanium 5\nPyerite 3', savedAt: Date.now() }],
      hydrated: true,
    });
    const appraiseText = vi.fn();
    renderPanel({ controller: controller({ appraiseText }) });
    await userEvent.click(screen.getByRole('combobox', { name: 'Load a recent list' }));
    await userEvent.click(await screen.findByRole('option', { name: /Tritanium, Pyerite/ }));
    expect(appraiseText).toHaveBeenCalledWith('Tritanium 5\nPyerite 3');
  });

  it('shows the hold bar only once a Cargo Space is set', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.queryByTestId('hold-bar')).not.toBeInTheDocument();
    cleanup();
    useHaulingCargo.setState({
      value: { label: 'Charon', holds: [{ kind: 'general', capacityM3: 1_000 }] },
      hydrated: true,
    });
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByTestId('hold-bar')).toHaveTextContent('1,255.5 of 1,000 m³');
    expect(screen.getByText('Does not fit in one trip.')).toBeInTheDocument();
  });
});
