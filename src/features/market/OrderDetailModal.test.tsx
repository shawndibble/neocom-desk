import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { OrderDetailModal } from './OrderDetailModal';
import type { OpenOrderRow, CharacterSkills } from './openOrdersModel';
import type { RegionCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
import { orderFloor } from '@/engine/market/orderFloor';
import { roundPriceUp } from '@/engine/market/priceTick';
import { configureClipboard } from '@/lib/clipboard';
import { historyPoint as buildHistoryPoint } from '@/engine/market/__fixtures__/priceHistory';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';

const SIMPLE_ORE_PROCESSING = 60377;
const WITH_RX_804 = characterModifiers({ skills: {}, implantTypeIds: [27174] });

/** Daily point `daysAgo` days before now, so it always lands inside a `30d` filter regardless of when the suite runs. */
/** A day of history `daysAgo` days back — these tests only ever vary the volume. */
function historyPoint(daysAgo: number, volume: number) {
  return buildHistoryPoint({
    date: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    average: 100,
    volume,
  });
}

const SKILLS: CharacterSkills = {
  accountingLevel: 5,
  brokerRelationsLevel: 5,
  advancedBrokerRelationsLevel: 5,
  modifiers: NO_CHARACTER_MODIFIERS,
};

const BASE_ROW: OpenOrderRow = {
  orderId: 101,
  characterId: 1,
  characterName: 'Alpha',
  typeId: 34,
  typeName: 'Tritanium',
  isBuyOrder: false,
  price: 500,
  volumeRemain: 10,
  volumeTotal: 10,
  locationId: 60003760,
  regionId: 10000002,
  stationName: 'Jita IV - Moon 4',
  issued: new Date().toISOString(),
  durationDays: 90,
  expiry: { expiresAt: Date.now() + 60 * 86_400_000, daysLeft: 60, expired: false },
  floor: null,
  costBasis: null,
  station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
  deepUndercut: null,
  worstScope: null,
  problem: 'healthy',
  problems: ['healthy'],
  iskTiedUp: 5000,
  belowFloor: false,
  frequentlyUndercut: false,
};

function renderModal(overrides: Partial<Parameters<typeof OrderDetailModal>[0]> = {}) {
  const onClose = vi.fn();
  const onCheckDeeper = vi.fn();
  render(
    <MemoryRouter>
      <OrderDetailModal
        open
        row={BASE_ROW}
        skills={undefined}
        deep={null}
        loadingDeep={false}
        history={null}
        stationChecked={false}
        stationsLoaded
        regionJumps={undefined}
        stationNameFor={(locationId) =>
          locationId === 60003760 ? 'Jita IV - Moon 4' : `Station ${locationId}`
        }
        onCheckDeeper={onCheckDeeper}
        onClose={onClose}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { onClose, onCheckDeeper };
}

/** Opens every folded section (issue #1428) — "Who is cheaper", the cost-basis ledger and "Is there a better exit?" all start collapsed. */
function expandAll() {
  for (const button of screen.getAllByRole('button', { expanded: false })) {
    fireEvent.click(button);
  }
}

describe('OrderDetailModal', () => {
  it('names the dialog after the item and shows the quick answer for a below-floor row', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'belowFloor',
      problems: ['belowFloor'],
      belowFloor: true,
      floor: { relist: 700, fill: 600 },
      costBasis: {
        unitCost: 600,
        runId: 'run-1',
        runQuantity: 10,
        materialCost: 3000,
        jobFee: 1200,
      },
    };
    renderModal({ row });

    // The dialog is named for the character as well as the item — several
    // characters can hold an order on the same thing.
    expect(screen.getByRole('dialog', { name: 'Alpha · Tritanium' })).toBeInTheDocument();
    expect(screen.getByText('Quick answer')).toBeInTheDocument();
    // With a floor in hand the quick answer is the call itself, not the
    // badge's generic explanation.
    expect(screen.getByText('Put the price up')).toBeInTheDocument();
    expect(
      screen.getByText(/Every unit sells for 200.00 ISK less than it cost you to make/)
    ).toBeInTheDocument();
    expect(screen.getByText('-28.6%')).toBeInTheDocument();
  });

  it('shows my price, floor, remaining and expires as stat chips', () => {
    const row: OpenOrderRow = { ...BASE_ROW, floor: { relist: 550, fill: 520 } };
    renderModal({ row });

    expect(screen.getByText('Never sell below')).toBeInTheDocument();
    expect(screen.getByText('550.00')).toBeInTheDocument();
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(screen.getByText('60d')).toBeInTheDocument();
  });

  it('offers "Refresh system & region prices" when the deep check has not run, and hides it once loading', () => {
    const { rerender } = render(
      <MemoryRouter>
        <OrderDetailModal
          open
          row={BASE_ROW}
          skills={undefined}
          deep={null}
          loadingDeep={false}
          history={null}
          stationChecked
          stationsLoaded
          regionJumps={undefined}
          stationNameFor={() => 'Jita IV - Moon 4'}
          onCheckDeeper={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expandAll();
    expect(
      screen.getByRole('button', { name: 'Refresh system & region prices' })
    ).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <OrderDetailModal
          open
          row={BASE_ROW}
          skills={undefined}
          deep={null}
          loadingDeep
          history={null}
          stationChecked
          stationsLoaded
          regionJumps={undefined}
          stationNameFor={() => 'Jita IV - Moon 4'}
          onCheckDeeper={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole('button', { name: 'Refresh system & region prices' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('calls onCheckDeeper when the group-level deep-check button is pressed', async () => {
    const user = userEvent.setup();
    const { onCheckDeeper } = renderModal({ stationChecked: true });
    expandAll();
    await user.click(screen.getByRole('button', { name: 'Refresh system & region prices' }));
    expect(onCheckDeeper).toHaveBeenCalledTimes(1);
  });

  it('renders an unresolved system scope as "not checked" rather than clean, once the region book is in but my own system could not be recovered', () => {
    const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
    const row: OpenOrderRow = {
      ...BASE_ROW,
      deepUndercut: { worst: null, byScope: { region: null } }, // 'system' deliberately absent
    };
    renderModal({ row, deep, stationChecked: true });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const systemRow = within(whoSection).getByText('System').closest('div');
    const regionRow = within(whoSection).getByText('Region').closest('div');
    expect(systemRow).toHaveTextContent('Not checked yet');
    expect(regionRow).toHaveTextContent('Nobody cheaper here');
  });

  it('exposes "Who is cheaper" as a table with column and row headers', () => {
    const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
    renderModal({ row: BASE_ROW, deep, stationChecked: true });
    expandAll();

    const table = screen.getByRole('table', { name: 'Who is cheaper, and where' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    expect(within(table).getByRole('columnheader', { name: 'How close' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Region' })).toBeInTheDocument();
  });

  it('shows a rival price and jump count for a checked, beaten region scope', () => {
    // Deliberately not the row's own `problem`/badge, so the "Region" text in
    // this section can't be confused with a "Region" scope-distance badge in
    // the quick-answer heading above it.
    const deep: RegionCompetition = {
      competitors: [
        {
          orderId: 999,
          price: 450,
          locationId: 60003469,
          systemId: 30000144,
          volumeRemain: 5,
          isBuyOrder: false,
        },
      ],
      fetchedAt: Date.now(),
      truncated: false,
    };
    const row: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutRegion',
      problems: ['undercutRegion'],
      worstScope: 'region',
      deepUndercut: {
        worst: {
          scope: 'region',
          price: 450,
          gapIsk: 50,
          gapPct: 10,
          volumeRemain: 5,
          locationId: 60003469,
          systemId: 30000144,
          ordersBeatingMe: 1,
          unitsBeatingMe: 5,
        },
        byScope: {
          region: {
            scope: 'region',
            price: 450,
            gapIsk: 50,
            gapPct: 10,
            volumeRemain: 5,
            locationId: 60003469,
            systemId: 30000144,
            ordersBeatingMe: 1,
            unitsBeatingMe: 5,
          },
        },
      },
    };
    renderModal({ row, deep, stationChecked: true, regionJumps: { kind: 'known', jumps: 4 } });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const regionRow = within(whoSection).getByText('Region').closest('div');
    // The "their price" / "I am over by" / "distance" columns of that row.
    expect(regionRow).toHaveTextContent('450.00');
    expect(regionRow).toHaveTextContent('10.0%');
    expect(regionRow).toHaveTextContent('4 jumps');
  });

  it('says the structure market cannot be read for station and system at a player structure, but still shows the region line', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      stationName: null,
      deepUndercut: { worst: null, byScope: { region: null } },
    };
    const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
    renderModal({ row, deep });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    const systemRow = within(whoSection).getByText('System').closest('div');
    const regionRow = within(whoSection).getByText('Region').closest('div');
    expect(stationRow).toHaveTextContent("The market inside a player structure can't be read yet");
    expect(systemRow).toHaveTextContent("The market inside a player structure can't be read yet");
    expect(regionRow).toHaveTextContent('Nobody cheaper here');
  });

  it('shows a real rival for the station scope once the structure market has been fetched (issue #538)', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      stationName: null,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      deepUndercut: {
        worst: {
          scope: 'station',
          price: 480,
          gapIsk: 20,
          gapPct: 4,
          volumeRemain: 7,
          locationId: 60003760,
          systemId: 0,
          ordersBeatingMe: 1,
          unitsBeatingMe: 7,
        },
        byScope: {
          station: {
            scope: 'station',
            price: 480,
            gapIsk: 20,
            gapPct: 4,
            volumeRemain: 7,
            locationId: 60003760,
            systemId: 0,
            ordersBeatingMe: 1,
            unitsBeatingMe: 7,
          },
        },
      },
    };
    renderModal({
      row,
      structureMarket: { competitors: [], truncated: false },
    });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    // A real price, not the "unavailable" copy — that's the whole point of #538.
    expect(stationRow).toHaveTextContent('480.00');
    expect(stationRow).toHaveTextContent('4.0%');
  });

  it('says nobody is cheaper at the structure once fetched clean, still unavailable for system', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      stationName: null,
      deepUndercut: { worst: null, byScope: { station: null } },
    };
    renderModal({ row, structureMarket: { competitors: [], truncated: false } });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    const systemRow = within(whoSection).getByText('System').closest('div');
    expect(stationRow).toHaveTextContent('Nobody cheaper here');
    expect(systemRow).toHaveTextContent("The market inside a player structure can't be read yet");
  });

  it('reads a clean-but-truncated structure book as "not checked", not "clear" (a partial book proves nothing)', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      stationName: null,
      deepUndercut: { worst: null, byScope: { station: null } },
    };
    renderModal({ row, structureMarket: { competitors: [], truncated: true } });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    expect(stationRow).toHaveTextContent('Not checked yet');
  });

  it('keeps the cost-basis card visible with no cost basis, and never shows a zero floor', () => {
    renderModal({ row: { ...BASE_ROW, costBasis: null, floor: null } });

    expect(screen.getByText('Where that price comes from')).toBeInTheDocument();
    expect(screen.getByText("We don't know what this cost you")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link a build' })).toBeInTheDocument();
    // The hint used to offer "or type in what it cost" — a route the app has
    // never had (issue #1020). Nothing may re-advertise it while the
    // hand-entered cost basis stays deferred.
    expect(screen.queryByText(/type in what it cost/i)).not.toBeInTheDocument();
    // Linking a build is the only real route, and it needs a Build Plan that
    // a pure trader does not have — so the hint has to name that up front
    // rather than send them to a page that will not help.
    const costSection = screen.getByText('Where that price comes from').closest('section')!;
    expect(within(costSection).getByText(/build plan on the Industry page/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0(\.00)? ISK$/)).not.toBeInTheDocument();
    // The headline floor stat chip reads the shared "unknown" dash, not zero.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders the full cost-basis ledger, with the fill floor only inside the tooltip explanation — never as a second visible number', () => {
    const row: OpenOrderRow = {
      ...BASE_ROW,
      floor: { relist: 724.45, fill: 620.96 },
      costBasis: {
        unitCost: 600,
        runId: 'run-1',
        runQuantity: 10,
        materialCost: 3000,
        jobFee: 1200,
      },
    };
    renderModal({ row, skills: SKILLS });
    expandAll();

    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('1,200 ISK')).toBeInTheDocument();
    expect(screen.getByText('4,200 ISK')).toBeInTheDocument();
    // Cost per unit reads straight off the cost basis, not re-derived.
    expect(screen.getByText('Cost per unit')).toBeInTheDocument();
    expect(screen.getByText('600.00 ISK')).toBeInTheDocument();
    // ONE floor on screen: the fill floor's label and its number must not
    // appear as a second visible ledger row.
    expect(screen.queryByText('If you leave it and it sells')).not.toBeInTheDocument();
    expect(screen.queryByText('620.96 ISK')).not.toBeInTheDocument();
  });

  it('sums cost per unit, sales tax and broker fee to exactly the relist floor shown', () => {
    // Real orderFloor() math this time (not the hand-picked literals of the
    // fixture above), so the sum is actually checked rather than eyeballed —
    // unitCost + salesTax(relist) + relistFee(relist, relist) === relist by
    // construction (relistBreakEvenPrice solves for exactly that revenue).
    const skills: CharacterSkills = {
      ...SKILLS,
      accountingLevel: 3,
      brokerRelationsLevel: 2,
      advancedBrokerRelationsLevel: 1,
    };
    const unitCost = 437.5;
    const floor = orderFloor({
      unitCost,
      remainingQuantity: 1,
      accountingLevel: skills.accountingLevel,
      brokerRelationsLevel: skills.brokerRelationsLevel,
      advancedBrokerRelationsLevel: skills.advancedBrokerRelationsLevel,
    });
    if (!floor) throw new Error('expected a floor for this fixture');

    const row: OpenOrderRow = {
      ...BASE_ROW,
      floor,
      costBasis: { unitCost, runId: 'run-2', runQuantity: 8, materialCost: 2500, jobFee: 1000 },
    };
    renderModal({ row, skills });
    expandAll();

    const ledger = screen.getByText('Where that price comes from').closest('section')!;
    const rowValue = (label: string) => {
      const text = within(ledger).getByText(label).nextElementSibling?.textContent ?? '';
      return Number(text.replace(/[^0-9.-]/g, ''));
    };

    const costPerUnit = rowValue('Cost per unit');
    const salesTax = rowValue('Sales tax');
    const brokerFeeValue = rowValue('Broker fee (relist discount applied)');

    expect(costPerUnit).toBeCloseTo(unitCost, 2);
    // The ledger math sums to the EXACT break-even, never the rounded-up
    // price the "Never sell below" row now displays (issue #1421) —
    // `belowFloor` detection stays exact for the same reason.
    expect(costPerUnit + salesTax + brokerFeeValue).toBeCloseTo(floor.relist, 1);
    // The displayed figure is that same break-even, rounded UP to a legal price.
    const relistShown = rowValue('Never sell below');
    expect(relistShown).toBe(roundPriceUp(floor.relist));
  });

  it('spreads the broker fee minimum across a large remaining quantity, not re-applied per unit', () => {
    // Regression pin for #1224: the ledger used to re-derive broker fee via
    // brokerFee(relist, ...), which re-clamped the per-unit relist price to
    // its own 100 ISK minimum — silently reintroducing the per-unit bug in
    // the fee ledger even after orderFloor() itself was fixed.
    const skills: CharacterSkills = { ...SKILLS, accountingLevel: 5, brokerRelationsLevel: 5 };
    const unitCost = 10;
    const floor = orderFloor({
      unitCost,
      remainingQuantity: 10_000,
      accountingLevel: skills.accountingLevel,
      brokerRelationsLevel: skills.brokerRelationsLevel,
      advancedBrokerRelationsLevel: skills.advancedBrokerRelationsLevel,
    });
    if (!floor) throw new Error('expected a floor for this fixture');

    const row: OpenOrderRow = {
      ...BASE_ROW,
      floor,
      volumeRemain: 10_000,
      costBasis: {
        unitCost,
        runId: 'run-3',
        runQuantity: 10_000,
        materialCost: 90_000,
        jobFee: 10_000,
      },
    };
    renderModal({ row, skills });
    expandAll();

    const ledger = screen.getByText('Where that price comes from').closest('section')!;
    const rowValue = (label: string) => {
      const text = within(ledger).getByText(label).nextElementSibling?.textContent ?? '';
      return Number(text.replace(/[^0-9.-]/g, ''));
    };

    const costPerUnit = rowValue('Cost per unit');
    const salesTax = rowValue('Sales tax');
    const brokerFeeValue = rowValue('Broker fee (relist discount applied)');

    // The whole point of the fix: the fee ledger must not show ~100 ISK.
    expect(brokerFeeValue).toBeLessThan(5);
    expect(costPerUnit + salesTax + brokerFeeValue).toBeCloseTo(floor.relist, 1);
    expect(rowValue('Never sell below')).toBe(roundPriceUp(floor.relist));
  });

  it('closes via the modal header close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reads station and system as "not checked" — not as a player structure — when the station lookup itself failed to load', () => {
    // stationsLoaded: false must never be confused with "this location isn't
    // an NPC station": the lookup simply hasn't answered yet (e.g. a first
    // offline visit, since that file is outside the install precache).
    renderModal({ stationsLoaded: false, deep: null });
    expandAll();

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    const systemRow = within(whoSection).getByText('System').closest('div');
    expect(stationRow).toHaveTextContent('Not checked yet');
    expect(systemRow).toHaveTextContent('Not checked yet');
    expect(stationRow).not.toHaveTextContent('player structure');
  });

  describe('truncated region book', () => {
    it('reads a clean region scope as "not checked" rather than clear, when the fetched book was truncated', () => {
      const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: true };
      const row: OpenOrderRow = {
        ...BASE_ROW,
        deepUndercut: { worst: null, byScope: { system: null, region: null } },
      };
      renderModal({ row, deep, stationChecked: true });
      expandAll();

      const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
      const regionRow = within(whoSection).getByText('Region').closest('div');
      expect(regionRow).toHaveTextContent('Not checked yet');
    });

    it('still trusts a rival the truncated book actually found', () => {
      const deep: RegionCompetition = {
        competitors: [
          {
            orderId: 999,
            price: 450,
            locationId: 60003469,
            systemId: 30000144,
            volumeRemain: 5,
            isBuyOrder: false,
          },
        ],
        fetchedAt: Date.now(),
        truncated: true,
      };
      const row: OpenOrderRow = {
        ...BASE_ROW,
        deepUndercut: {
          worst: {
            scope: 'region',
            price: 450,
            gapIsk: 50,
            gapPct: 10,
            volumeRemain: 5,
            locationId: 60003469,
            systemId: 30000144,
            ordersBeatingMe: 1,
            unitsBeatingMe: 5,
          },
          byScope: {
            region: {
              scope: 'region',
              price: 450,
              gapIsk: 50,
              gapPct: 10,
              volumeRemain: 5,
              locationId: 60003469,
              systemId: 30000144,
              ordersBeatingMe: 1,
              unitsBeatingMe: 5,
            },
          },
        },
      };
      renderModal({ row, deep, stationChecked: true });
      expandAll();

      const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
      const regionRow = within(whoSection).getByText('Region').closest('div');
      expect(regionRow).toHaveTextContent('450.00');
    });

    it('explains the "not checked" reads with an incomplete-data line, so a truncated fetch does not look identical to never having checked at all', () => {
      const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: true };
      const row: OpenOrderRow = {
        ...BASE_ROW,
        deepUndercut: { worst: null, byScope: { system: null, region: null } },
      };
      renderModal({ row, deep, stationChecked: true });
      expandAll();

      const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
      expect(
        within(whoSection).getByText('Incomplete data — some pages could not be loaded')
      ).toBeInTheDocument();
      // And the "check deeper" button must not come back — this is a
      // resolved (if partial) fetch, not the pre-fetch state.
      expect(
        within(whoSection).queryByRole('button', { name: 'Refresh system & region prices' })
      ).not.toBeInTheDocument();
    });

    it('shows no incomplete-data line once the fetched book was complete', () => {
      const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
      renderModal({ deep, stationChecked: true });

      expect(
        screen.queryByText('Incomplete data — some pages could not be loaded')
      ).not.toBeInTheDocument();
    });
  });

  describe('sells-out-in stat chip', () => {
    it('shows a day count for a busy item', () => {
      const history: PriceHistoryResult = {
        points: [historyPoint(1, 100), historyPoint(2, 100), historyPoint(3, 100)],
        fetchedAt: Date.now(),
      };
      // regionUnitsPerDay = 300/30 = 10/day; myShare defaults to 1 (deep not
      // fetched); volumeRemain is BASE_ROW's 10 -> ceil(10/10) = 1 day.
      renderModal({ history });

      expect(screen.getByText('Sells out in')).toBeInTheDocument();
      expect(screen.getByText('1d')).toBeInTheDocument();
    });

    it('shows "can\'t tell" (never a number) for an item with no sales in the last 30 days', () => {
      const history: PriceHistoryResult = {
        points: [historyPoint(45, 500)], // outside the 30-day window entirely
        fetchedAt: Date.now(),
      };
      renderModal({ history });

      // Scoped to the "Sells out in" card itself — "60d" elsewhere on the
      // modal (BASE_ROW's own expiry card) is a different stat entirely.
      const chip = screen.getByText('Sells out in').closest('div') as HTMLElement;
      expect(within(chip).getByText('Nothing has sold in the last 30 days')).toBeInTheDocument();
      expect(within(chip).queryByText(/^\d+d$/)).not.toBeInTheDocument();
    });

    it('says "can\'t tell yet" (never a number) when there is no price history at all', () => {
      renderModal({ history: null });

      expect(screen.getByText("Can't tell yet")).toBeInTheDocument();
    });

    it("adds the past-expiry line when the clear-out estimate runs past the order's own expiry", () => {
      const history: PriceHistoryResult = {
        points: [historyPoint(1, 30), historyPoint(2, 30), historyPoint(3, 30)],
        fetchedAt: Date.now(),
      };
      // regionUnitsPerDay = 90/30 = 3/day; volumeRemain 1000 -> ceil(1000/3)
      // = 334 days, far past BASE_ROW's 60-day expiry.
      const row: OpenOrderRow = { ...BASE_ROW, volumeRemain: 1000, volumeTotal: 1000 };
      renderModal({ row, history });

      expect(screen.getByText('334d')).toBeInTheDocument();
      expect(screen.getByText('Runs past the day this order expires')).toBeInTheDocument();
    });

    it('shrinks the estimate by my share of the same-side queue once the deep competitors are in hand', () => {
      const history: PriceHistoryResult = {
        points: [historyPoint(1, 300), historyPoint(2, 300), historyPoint(3, 300)],
        fetchedAt: Date.now(),
      };
      // regionUnitsPerDay = 900/30 = 30/day. A same-side rival priced at or
      // better than mine, holding the same remaining volume as my order,
      // halves my share of that rate: myShare = 100/(100+100) = 0.5, so
      // 15/day -> ceil(100/15) = 7 days, not the naive ceil(100/30) = 4.
      const deep: RegionCompetition = {
        competitors: [
          {
            orderId: 999,
            price: 480,
            locationId: 60003469,
            systemId: 30000144,
            volumeRemain: 100,
            isBuyOrder: false,
          },
        ],
        fetchedAt: Date.now(),
        truncated: false,
      };
      const row: OpenOrderRow = { ...BASE_ROW, price: 500, volumeRemain: 100, volumeTotal: 100 };
      renderModal({ row, history, deep });

      expect(screen.getByText('7d')).toBeInTheDocument();
    });
  });

  describe('quick answer, exits and rank', () => {
    const UNDERCUT_ROW: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
    };

    it('shows the wallet ledger for a wallet-derived cost basis', () => {
      renderModal({
        row: {
          ...BASE_ROW,
          costBasis: {
            source: 'wallet',
            unitCost: 400,
            unitsCovered: 10,
            buyCount: 2,
            oldestBuy: '2026-01-01T00:00:00Z',
            newestBuy: '2026-01-05T00:00:00Z',
            buys: [{ date: '2026-01-05T00:00:00Z', quantity: 10, unitPrice: 400 }],
            truncated: false,
          },
        },
      });
      expandAll();
      expect(screen.getByText('Units priced from your wallet')).toBeInTheDocument();
      expect(screen.getByText('Wallet buys used')).toBeInTheDocument();
      expect(screen.getByText(/10 at 400.00 ISK on/)).toBeInTheDocument();
      expect(
        screen.getByText(/Broker fees paid when you bought are not included/)
      ).toBeInTheDocument();
    });

    it('says how much of the stock the wallet covers when it only partly does', () => {
      renderModal({
        row: {
          ...BASE_ROW,
          volumeRemain: 30,
          walletGap: { kind: 'partial', coveredUnits: 12, pool: 30, truncated: false },
        },
      });
      expect(
        screen.getByText('Your wallet shows buys for 12 of these 30 units.')
      ).toBeInTheDocument();
    });

    it('falls back to the badge advice when there is no floor to judge against', () => {
      renderModal({ row: UNDERCUT_ROW, stationChecked: true });
      expandAll();

      expect(screen.getByText('Lower price or wait out other sellers.')).toBeInTheDocument();
      expect(screen.queryByText('Do not chase this one')).not.toBeInTheDocument();
      // No floor to advise a match against, but the cheapest rival is still a
      // fact worth stating (owner decision, issue #1428) — never advice to match it.
      expect(screen.getByText('Cheapest seller: 450.00')).toBeInTheDocument();
      // And the exits card says why it has nothing to offer.
      expect(
        screen.getByText(
          'Link a build, or buy with this character, and we can work out what each way out is worth.'
        )
      ).toBeInTheDocument();
    });

    it('calls it once a floor exists, and prices the exits', () => {
      const row: OpenOrderRow = { ...UNDERCUT_ROW, floor: { relist: 480, fill: 470 } };
      renderModal({ row, stationChecked: true });
      expandAll();

      expect(screen.getByText('Do not chase this one')).toBeInTheDocument();
      // Holding nets price - fill; undercutting (one legal tick under the
      // 450 rival, i.e. 449.90 — issue #1421) nets that price - relist.
      expect(screen.getByText('Hold at 500.00')).toBeInTheDocument();
      expect(screen.getByText('+30.00 / unit')).toBeInTheDocument();
      expect(screen.getByText('Undercut the station at 449.90')).toBeInTheDocument();
      expect(screen.getByText('-30.10 / unit')).toBeInTheDocument();
    });

    it('copies the exact legal suggested price through the injected clipboard writer, in plain digits', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      const row: OpenOrderRow = { ...UNDERCUT_ROW, floor: { relist: 400, fill: 390 } };
      renderModal({ row, stationChecked: true });

      const user = userEvent.setup();
      // The verdict's own suggested price: undercutPrice(450) = 449.90 —
      // scoped to the quick-answer section, since the exits list below
      // coincidentally suggests the very same price for its own undercut row.
      const quickAnswer = screen.getByText('Quick answer').closest('section')!;
      await user.click(within(quickAnswer).getByRole('button', { name: 'Copy 449.90' }));
      expect(written).toEqual(['449.90']);

      configureClipboard(null);
    });

    it('offers a suggested bid for an outbid buy order, with its own copy button', async () => {
      const written: string[] = [];
      configureClipboard(async (text) => {
        written.push(text);
      });
      const row: OpenOrderRow = {
        ...BASE_ROW,
        isBuyOrder: true,
        problem: 'outbid',
        problems: ['outbid'],
        worstScope: 'station',
        station: { bestPrice: 520, beatsMe: true, gapIsk: 20, gapPct: 4 },
      };
      renderModal({ row, stationChecked: true });

      // outbidPrice(520) = 520.10 — one legal tick over the rival bid.
      expect(screen.getByText('Outbid at 520.10')).toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Copy 520.10' }));
      expect(written).toEqual(['520.10']);

      configureClipboard(null);
    });

    it('offers no outbid suggestion for a sell order', () => {
      renderModal({ row: UNDERCUT_ROW, stationChecked: true });
      expect(screen.queryByText(/^Outbid at/)).not.toBeInTheDocument();
    });

    it('names reprocessing as not built rather than estimating it', () => {
      renderModal({ row: UNDERCUT_ROW, stationChecked: true });
      expandAll();

      expect(screen.getByText('Reprocess and sell the minerals')).toBeInTheDocument();
    });

    it('offers the hubs that bid more than the local exit, with the distance to each', () => {
      renderModal({
        row: UNDERCUT_ROW,
        stationChecked: true,
        hubs: [
          {
            hubId: 'amarr',
            systemName: 'Amarr',
            stationId: 60008494,
            buyMax: 600,
            jumps: { kind: 'known', jumps: 9 },
          },
          { hubId: 'rens', systemName: 'Rens', stationId: 60004588, buyMax: 400 },
        ],
      });
      expandAll();

      // UNDERCUT_ROW asks 500 with no local buy order, so Amarr's 600 bid is
      // +100 a unit across its 10 remaining units; Rens bids under the ask.
      expect(screen.getByText(/Amarr bids 600.00/)).toBeInTheDocument();
      expect(screen.getByText('9 jumps')).toBeInTheDocument();
      expect(screen.getByText('+100.00 / unit, 1,000.00 in all')).toBeInTheDocument();
      expect(screen.queryByText(/Rens bids/)).not.toBeInTheDocument();
    });

    it('says so when no hub beats the local exit, and never claims that before the prices land', () => {
      renderModal({
        row: UNDERCUT_ROW,
        stationChecked: true,
        hubs: [{ hubId: 'rens', systemName: 'Rens', stationId: 60004588, buyMax: 400 }],
      });
      expandAll();
      expect(
        screen.getByText('No trade hub bids more than you can get where this stock sits.')
      ).toBeInTheDocument();

      cleanup();
      renderModal({ row: UNDERCUT_ROW, stationChecked: true, hubs: undefined });
      expandAll();
      expect(screen.getByText('Checking the trade hubs…')).toBeInTheDocument();

      cleanup();
      renderModal({ row: UNDERCUT_ROW, stationChecked: true, hubs: undefined, hubsFailed: true });
      expandAll();
      expect(
        screen.getByText('Could not read the trade hub prices. Reopen this order to try again.')
      ).toBeInTheDocument();
    });

    it('keeps a hub row on an order with no floor, where every other exit is silent', () => {
      renderModal({
        row: { ...UNDERCUT_ROW, floor: null },
        stationChecked: true,
        hubs: [{ hubId: 'amarr', systemName: 'Amarr', stationId: 60008494, buyMax: 600 }],
      });
      expandAll();

      expect(
        screen.getByText(
          'Link a build, or buy with this character, and we can work out what each way out is worth.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/Amarr bids 600.00/)).toBeInTheDocument();
    });

    it('ranks my price at my station from a complete book, and not from a truncated one', () => {
      const competitors = [
        {
          orderId: 101,
          price: 500,
          locationId: 60003760,
          systemId: 30000142,
          volumeRemain: 10,
          isBuyOrder: false,
        },
        {
          orderId: 2,
          price: 450,
          locationId: 60003760,
          systemId: 30000142,
          volumeRemain: 5,
          isBuyOrder: false,
        },
        {
          orderId: 3,
          price: 460,
          locationId: 60003760,
          systemId: 30000142,
          volumeRemain: 5,
          isBuyOrder: false,
        },
      ];
      renderModal({
        row: UNDERCUT_ROW,
        stationChecked: true,
        deep: { competitors, truncated: false, fetchedAt: Date.now() },
      });
      expect(screen.getByText('Rank 3 of 3 at this station')).toBeInTheDocument();

      cleanup();
      renderModal({
        row: UNDERCUT_ROW,
        stationChecked: true,
        deep: { competitors, truncated: true, fetchedAt: Date.now() },
      });
      expect(screen.queryByText(/Rank \d+ of/)).not.toBeInTheDocument();
    });
  });

  describe('reprocess and sell the materials', () => {
    /** 10 units refine into 1,000 Tritanium at 100%; the assumed 50% station halves it. */
    const REPROCESSING = {
      entry: {
        portionSize: 10,
        materials: [{ typeID: 34, quantity: 1000 }],
        specialisationSkillID: SIMPLE_ORE_PROCESSING,
      },
      modifiers: NO_CHARACTER_MODIFIERS,
      materialPrices: { 34: 2 },
    };
    const FLOORED_ROW: OpenOrderRow = { ...BASE_ROW, floor: { relist: 400, fill: 380 } };

    it('stays greyed as not built until the refining data has loaded', () => {
      renderModal({ row: FLOORED_ROW });
      expandAll();

      const row = screen.getByText('Reprocess and sell the minerals').closest('p')!;
      expect(row).toHaveTextContent('not built yet');
    });

    it('prices the refine and names the assumptions behind it', () => {
      renderModal({ row: FLOORED_ROW, reprocessing: REPROCESSING });
      expandAll();

      // 10 units -> 500 Tritanium at 2 ISK = 1,000 over 10 units = 100 a unit.
      expect(
        screen.getByText('Reprocess and sell the materials, 100.00 a unit')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Assumes a 50% station and no station tax, valued against the buy orders here.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText('Reprocess and sell the minerals')).not.toBeInTheDocument();
    });

    it('says nothing about an implant when none is fitted', () => {
      renderModal({ row: FLOORED_ROW, reprocessing: REPROCESSING });
      expect(screen.queryByText(/fitted refining implant/)).not.toBeInTheDocument();
    });

    it("names the fitted refining implant's bonus (issue #1227)", () => {
      renderModal({
        row: FLOORED_ROW,
        reprocessing: { ...REPROCESSING, modifiers: WITH_RX_804 },
      });
      expandAll();
      expect(
        screen.getByText(
          "Includes the active clone's fitted refining implant, +4% to ore and ice yield."
        )
      ).toBeInTheDocument();
    });

    it("omits the implant hint for scrap — the implant's own description covers ore and ice only (issue #1227)", () => {
      renderModal({
        row: FLOORED_ROW,
        reprocessing: {
          ...REPROCESSING,
          // No specialisation attribute = scrap.
          entry: { portionSize: 10, materials: [{ typeID: 34, quantity: 1000 }] },
          modifiers: WITH_RX_804,
        },
      });
      expect(screen.queryByText(/fitted refining implant/)).not.toBeInTheDocument();
    });

    it('says how much stock is short of a whole refining batch', () => {
      renderModal({ row: { ...FLOORED_ROW, volumeRemain: 23 }, reprocessing: REPROCESSING });
      expandAll();

      expect(
        screen.getByText('3 units are short of a full refining batch and return nothing.')
      ).toBeInTheDocument();
    });

    it('warns that the total is a floor when a material has no buy order here', () => {
      renderModal({
        row: FLOORED_ROW,
        reprocessing: { ...REPROCESSING, materialPrices: {} },
      });
      expandAll();

      expect(
        screen.getByText('At least one material has no buy order here, so this total is a floor.')
      ).toBeInTheDocument();
    });
  });

  describe('folding (issue #1428)', () => {
    const RICH_ROW: OpenOrderRow = {
      ...BASE_ROW,
      problem: 'undercutStation',
      problems: ['undercutStation'],
      worstScope: 'station',
      floor: { relist: 480, fill: 470 },
      station: { bestPrice: 450, beatsMe: true, gapIsk: 50, gapPct: 10 },
      costBasis: {
        unitCost: 400,
        runId: 'run-1',
        runQuantity: 10,
        materialCost: 3000,
        jobFee: 1000,
      },
    };

    it('starts every foldable section collapsed, each with its own one-line trailing read', () => {
      renderModal({ row: RICH_ROW, stationChecked: true });

      // Collapsed: only the heading/trailing row shows, not the content.
      expect(screen.queryByText('Nobody cheaper here')).not.toBeInTheDocument();
      expect(screen.queryByText('Qty')).not.toBeInTheDocument();
      expect(screen.queryByText('Hold at')).not.toBeInTheDocument();

      const who = screen.getByRole('button', { name: /Who is cheaper/ });
      const cost = screen.getByRole('button', { name: /Where that price comes from/ });
      const exits = screen.getByRole('button', { name: /Is there a better exit/ });
      expect(who).toHaveAttribute('aria-expanded', 'false');
      expect(cost).toHaveAttribute('aria-expanded', 'false');
      expect(exits).toHaveAttribute('aria-expanded', 'false');
      // One-line trailing reads, visible without expanding.
      expect(who).toHaveTextContent('Station · 450.00');
      expect(cost).toHaveTextContent('400.00 ISK/unit');
      expect(exits).toHaveTextContent(/Hold ·/);
    });

    it('reads "Clear" once every scope is checked and clean, and "Not checked" while any scope still is not', () => {
      renderModal({ row: BASE_ROW, stationChecked: true, deep: null });
      expect(screen.getByRole('button', { name: /Who is cheaper/ })).toHaveTextContent(
        'Not checked'
      );

      cleanup();
      const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
      const clearRow: OpenOrderRow = {
        ...BASE_ROW,
        deepUndercut: { worst: null, byScope: { system: null, region: null } },
      };
      renderModal({ row: clearRow, stationChecked: true, deep });
      expect(screen.getByRole('button', { name: /Who is cheaper/ })).toHaveTextContent('Clear');
    });

    it('carries the verdict price on the Next step line for raisePrice, matchThem, letGo and leaveItAlone', () => {
      const belowFloor: OpenOrderRow = {
        ...BASE_ROW,
        problem: 'belowFloor',
        problems: ['belowFloor'],
        belowFloor: true,
        floor: { relist: 700, fill: 600 },
      };
      renderModal({ row: belowFloor });
      expect(screen.getByText('Next step')).toBeInTheDocument();
      expect(screen.getByText('Set your price to 700.00')).toBeInTheDocument();

      cleanup();
      const matchThem: OpenOrderRow = { ...RICH_ROW, floor: { relist: 400, fill: 390 } };
      renderModal({ row: matchThem, stationChecked: true });
      expect(screen.getByText('Set your price to 449.90')).toBeInTheDocument();

      cleanup();
      renderModal({ row: RICH_ROW, stationChecked: true }); // letGo: undercutting to 449.90 loses money against a 480 floor
      expect(screen.getByText('Keep it at 500.00')).toBeInTheDocument();

      cleanup();
      renderModal({ row: { ...BASE_ROW, floor: { relist: 400, fill: 390 } } }); // healthy -> leaveItAlone
      expect(screen.getByText('Keep it at 500.00')).toBeInTheDocument();
    });

    it('shows no Next step line — only the badge advice — with nothing to base one on', () => {
      const row: OpenOrderRow = {
        ...BASE_ROW,
        problem: 'expiringOrStale',
        problems: ['expiringOrStale'],
      };
      renderModal({ row });
      expect(screen.queryByText('Next step')).not.toBeInTheDocument();
      expect(
        screen.getByText('Relist it, or move the stock somewhere it sells.')
      ).toBeInTheDocument();
    });

    it('folds "the numbers" behind a Disclosure on a phone, but leaves it open on desktop', () => {
      const original = window.matchMedia;
      // `useIsPhone` reads a max-width query; answering yes is how a phone looks under test.
      window.matchMedia = (media: string) =>
        ({
          media,
          matches: true,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList;

      try {
        renderModal();
        // "Volume left" (10 / 10) lives only in the stat grid — folded away
        // on a phone until the section is opened.
        expect(screen.queryByText('10 / 10')).not.toBeInTheDocument();
        const numbers = screen.getByRole('button', { name: /The numbers/ });
        expect(numbers).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(numbers);
        expect(screen.getByText('10 / 10')).toBeInTheDocument();
      } finally {
        window.matchMedia = original;
      }
    });
  });
});
