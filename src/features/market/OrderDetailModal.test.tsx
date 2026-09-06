import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { OrderDetailModal } from './OrderDetailModal';
import type { OpenOrderRow, CharacterSkills } from './openOrdersModel';
import type { RegionCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
import { orderFloor } from '@/engine/market/orderFloor';

/** Daily point `daysAgo` days before now, so it always lands inside a `30d` filter regardless of when the suite runs. */
function historyPoint(daysAgo: number, volume: number) {
  return {
    date: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    average: 100,
    volume,
  };
}

const SKILLS: CharacterSkills = { accountingLevel: 5, brokerRelationsLevel: 5 };

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
        onCheckDeeper={onCheckDeeper}
        onClose={onClose}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { onClose, onCheckDeeper };
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

    expect(screen.getByRole('dialog', { name: 'Tritanium' })).toBeInTheDocument();
    expect(screen.getByText('Quick answer')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your price is under what this cost you plus the fees, so selling it loses ISK.'
      )
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

  it('offers "Check system and region" when the deep check has not run, and hides it once loading', () => {
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
          onCheckDeeper={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Check system and region' })).toBeInTheDocument();

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
          onCheckDeeper={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole('button', { name: 'Check system and region' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('calls onCheckDeeper when the group-level deep-check button is pressed', async () => {
    const user = userEvent.setup();
    const { onCheckDeeper } = renderModal({ stationChecked: true });
    await user.click(screen.getByRole('button', { name: 'Check system and region' }));
    expect(onCheckDeeper).toHaveBeenCalledTimes(1);
  });

  it('renders an unresolved system scope as "not checked" rather than clean, once the region book is in but my own system could not be recovered', () => {
    const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: false };
    const row: OpenOrderRow = {
      ...BASE_ROW,
      deepUndercut: { worst: null, byScope: { region: null } }, // 'system' deliberately absent
    };
    renderModal({ row, deep, stationChecked: true });

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const systemRow = within(whoSection).getByText('System').closest('div');
    const regionRow = within(whoSection).getByText('Region').closest('div');
    expect(systemRow).toHaveTextContent('Not checked yet');
    expect(regionRow).toHaveTextContent('Nobody cheaper here');
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

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const regionRow = within(whoSection).getByText('Region').closest('div');
    expect(regionRow).toHaveTextContent('450.00 ISK');
    expect(regionRow).toHaveTextContent('-10.0%');
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

    const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
    const stationRow = within(whoSection).getByText('Station').closest('div');
    const systemRow = within(whoSection).getByText('System').closest('div');
    const regionRow = within(whoSection).getByText('Region').closest('div');
    expect(stationRow).toHaveTextContent("The market inside a player structure can't be read yet");
    expect(systemRow).toHaveTextContent("The market inside a player structure can't be read yet");
    expect(regionRow).toHaveTextContent('Nobody cheaper here');
  });

  it('keeps the cost-basis card visible with no cost basis, and never shows a zero floor', () => {
    renderModal({ row: { ...BASE_ROW, costBasis: null, floor: null } });

    expect(screen.getByText('Where that number comes from')).toBeInTheDocument();
    expect(screen.getByText("We don't know what this cost you")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link a build' })).toBeInTheDocument();
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
    // unitCost + salesTax(relist) + brokerFee(relist) === relist by
    // construction (breakEvenPrice solves for exactly that revenue).
    const skills: CharacterSkills = { accountingLevel: 3, brokerRelationsLevel: 2 };
    const unitCost = 437.5;
    const floor = orderFloor({
      unitCost,
      accountingLevel: skills.accountingLevel,
      brokerRelationsLevel: skills.brokerRelationsLevel,
    });
    if (!floor) throw new Error('expected a floor for this fixture');

    const row: OpenOrderRow = {
      ...BASE_ROW,
      floor,
      costBasis: { unitCost, runId: 'run-2', runQuantity: 8, materialCost: 2500, jobFee: 1000 },
    };
    renderModal({ row, skills });

    const ledger = screen.getByText('Where that number comes from').closest('section')!;
    const rowValue = (label: string) => {
      const text = within(ledger).getByText(label).nextElementSibling?.textContent ?? '';
      return Number(text.replace(/[^0-9.-]/g, ''));
    };

    const costPerUnit = rowValue('Cost per unit');
    const salesTax = rowValue('Sales tax');
    const brokerFeeValue = rowValue('Broker fee');
    const relist = rowValue('Never sell below');

    expect(costPerUnit).toBeCloseTo(unitCost, 2);
    expect(costPerUnit + salesTax + brokerFeeValue).toBeCloseTo(relist, 1);
    expect(relist).toBeCloseTo(floor.relist, 2);
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

      const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
      const regionRow = within(whoSection).getByText('Region').closest('div');
      expect(regionRow).toHaveTextContent('450.00 ISK');
    });

    it('explains the "not checked" reads with an incomplete-data line, so a truncated fetch does not look identical to never having checked at all', () => {
      const deep: RegionCompetition = { competitors: [], fetchedAt: Date.now(), truncated: true };
      const row: OpenOrderRow = {
        ...BASE_ROW,
        deepUndercut: { worst: null, byScope: { system: null, region: null } },
      };
      renderModal({ row, deep, stationChecked: true });

      const whoSection = screen.getByText('Who is cheaper, and where').closest('section')!;
      expect(
        within(whoSection).getByText('Incomplete data — some pages could not be loaded')
      ).toBeInTheDocument();
      // And the "check deeper" button must not come back — this is a
      // resolved (if partial) fetch, not the pre-fetch state.
      expect(
        within(whoSection).queryByRole('button', { name: 'Check system and region' })
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

      // Scoped to the "Sells out in" chip itself — "60d" elsewhere on the
      // modal (BASE_ROW's own expiresIn chip) is a different stat entirely.
      const chip = screen
        .getByText('Sells out in')
        .closest('span[class*="inline-flex"]') as HTMLElement;
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
});
