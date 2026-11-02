import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { TRADE_HUBS } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import type { TripLine } from '@/engine/market/haulingPlan';
import type { InstantHaulingScanRow, ListHaulingScanRow } from './haulingData';
import { toViewRows, type HaulingViewRow } from './haulingView';
import { FakeItemActions, fakeItemActions } from './__fixtures__/itemActions';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
vi.mock('@/sde/loadSde', () => ({ loadPi: vi.fn(async () => pi) }));

const { HaulingItemDetail } = await import('./HaulingItemDetail');

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};
const AMARR = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const JITA = TRADE_HUBS.find((h) => h.id === 'jita')!;

function listRow(
  sale: Partial<ListHaulingScanRow['sale']> = {},
  buyPrice = 10_460_000
): HaulingViewRow {
  const row: ListHaulingScanRow = {
    mode: 'list',
    typeId: 2048,
    name: 'Damage Control II',
    fromHub: AMARR,
    toHub: JITA,
    groupId: 60,
    categoryId: 7,
    unitVolumeM3: 5,
    buyLadder: [{ price: buyPrice, units: 50, orders: 3 }],
    destLadder: [
      { price: 23_170_000, units: 1, orders: 1 },
      { price: 23_280_000, units: 3, orders: 2 },
      { price: 23_290_000, units: 1, orders: 1 },
    ],
    destBuyLadder: [],
    demand: {
      dailyVolume: 0.6,
      daysWithTrades: 20,
      recentSalePrice: 23_500_000,
      latestDay: null,
      demand: 'most-days',
    },
    sale: {
      price: 23_160_000,
      lowestAsk: 23_170_000,
      undercutPrice: 23_160_000,
      recentSalePrice: 23_500_000,
      unitsAhead: 5,
      dailyVolume: 0.6,
      daysToSell: 9,
      demandCapUnits: 2,
      ...sale,
    },
  };
  return toViewRows([row], () => FEES)[0]!;
}

function instantRow(): HaulingViewRow {
  const row: InstantHaulingScanRow = {
    mode: 'instant',
    typeId: 2048,
    name: 'Damage Control II',
    fromHub: AMARR,
    toHub: JITA,
    groupId: 60,
    categoryId: 7,
    unitVolumeM3: 5,
    buyLadder: [{ price: 100, units: 30, orders: 1 }],
    destLadder: [],
    destBuyLadder: [
      { price: 130, units: 10, orders: 1 },
      { price: 125, units: 10, orders: 1 },
      { price: 90, units: 100, orders: 3 },
    ],
  };
  return toViewRows([row], () => FEES)[0]!;
}

function renderDetail(row: HaulingViewRow, line?: TripLine) {
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={['/market/hauling']}>
      <FakeItemActions actions={actions}>
        <HaulingItemDetail row={row} line={line} loadNote="5 m³ · limited by space" />
      </FakeItemActions>
    </MemoryRouter>
  );
  return actions;
}

function line(quantity: number): TripLine {
  return {
    typeId: 2048,
    name: 'Damage Control II',
    quantity,
    volumeM3: quantity * 5,
    cost: 0,
    profit: 0,
    maxBuyPrice: null,
    selected: true,
    limitedBy: 'space',
    placements: [],
  };
}

describe('HaulingItemDetail — listing', () => {
  it('without its title row, puts the given actions on the flags and lane line', () => {
    render(
      <MemoryRouter initialEntries={['/market/hauling']}>
        <FakeItemActions actions={fakeItemActions()}>
          <HaulingItemDetail
            row={listRow()}
            showTitle={false}
            laneActions={<button type="button">More</button>}
          />
        </FakeItemActions>
      </MemoryRouter>
    );
    const lane = screen.getByText('Amarr to Jita').closest('div')!.parentElement!;
    expect(within(lane).getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows Pay at most as full ISK, never shorthand', () => {
    renderDetail(listRow());
    const label = screen.getByText('Pay at most');
    const block = label.parentElement!;
    // Full digits with grouping: no "M"/"B" shorthand.
    expect(within(block).getByText(/^\d{1,3}(,\d{3})+$/)).toBeInTheDocument();
    expect(block.textContent).not.toMatch(/\d+(\.\d+)?\s?[MBK]\b/);
    expect(within(block).getByText('each in Amarr, to keep a 5% margin')).toBeInTheDocument();
  });

  it('places your listing among the sell orders by price, with the plan’s units', () => {
    // An Expected Sell Price above the cheapest order lands after it.
    renderDetail(listRow({ price: 23_200_000 }), line(4));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const prices = rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(prices).toEqual(['23,170,000', '23,200,000your listing', '23,280,000', '23,290,000']);
    expect(within(rows[1]!).getAllByRole('cell')[1]).toHaveTextContent('4');
  });

  it('names the latest day’s two kinds of sale when they are far apart, and nothing when close', () => {
    const split = listRow() as HaulingViewRow & ListHaulingScanRow;
    split.demand = {
      ...split.demand,
      latestDay: { date: '2026-10-13', highest: 289_000_000, lowest: 25_310_000 },
    };
    renderDetail(split);
    expect(
      screen.getByText(
        'Last sales (2026-10-13): 289,000,000 from a listing, 25,310,000 into a buy order.'
      )
    ).toBeInTheDocument();
    cleanup();

    const close = listRow() as HaulingViewRow & ListHaulingScanRow;
    close.demand = { ...close.demand, latestDay: { date: '2026-10-13', highest: 100, lowest: 95 } };
    renderDetail(close);
    expect(screen.queryByText(/Last sales/)).toBeNull();
  });

  it('shows Days to Sell and how fast it sells', () => {
    renderDetail(listRow());
    expect(screen.getByText('about 9 days')).toBeInTheDocument();
    // Each segment carries its trailing dot, so a wrap never starts a line with one.
    expect(screen.getByText('0.6 sold a day ·')).toBeInTheDocument();
    expect(screen.getByText('5 listed near your price')).toBeInTheDocument();
  });

  it('keeps the math closed until asked, then shows the ledger and why the price', async () => {
    const user = userEvent.setup();
    renderDetail(listRow(), line(2));
    const toggle = screen.getByRole('button', { name: 'Show the math' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Broker fee')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sales tax')).toBeInTheDocument();
    expect(screen.getByText('Broker fee')).toBeInTheDocument();
    expect(screen.getByText('Profit each')).toBeInTheDocument();
    expect(
      screen.getByText(
        'lower of recent sales (23,500,000) and one tick under the cheapest listing (23,160,000).'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('5 m³ each · in your plan: 2 units · 5 m³ · limited by space')
    ).toBeInTheDocument();
  });

  it('links Show info, both end markets and Route Safety for the lane', () => {
    renderDetail(listRow());
    expect(screen.getByRole('link', { name: 'Jita market' })).toHaveAttribute(
      'href',
      expect.stringContaining('hub=jita')
    );
    expect(screen.getByRole('link', { name: 'Amarr market' })).toHaveAttribute(
      'href',
      expect.stringContaining('hub=amarr')
    );
    const route = screen.getByRole('link', { name: 'Route safety' }).getAttribute('href')!;
    expect(route).toContain(`from=${AMARR.systemId}`);
    expect(route).toContain(String(JITA.systemId));
    // A real link (new tab, copy link), not a button.
    expect(screen.getByRole('link', { name: 'Show info' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=type-2048')
    );
  });

  it('carries every item action in its ⋮', async () => {
    const user = userEvent.setup();
    const actions = renderDetail(listRow());
    await user.click(screen.getByRole('button', { name: 'More actions for Damage Control II' }));
    // Opening the ⋮ loads the blueprint catalog, so Build Plan can show.
    expect(actions.requestBlueprints).toHaveBeenCalled();
    // Quickbar, price alert and stock target fold into the Track submenu.
    await user.click(await screen.findByRole('menuitem', { name: 'Track' }));
    for (const name of [
      'Add to Quickbar',
      'Set price alert',
      'Set stock target',
      'Show info',
      'Open in EVE',
      'Add to Compare',
      'View in Market',
      'Copy name',
      'Build Plan (checking…)',
    ]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
    }
  });
});

describe('HaulingItemDetail — nothing worth buying', () => {
  it('says so instead of a zero profit', () => {
    renderDetail(listRow({}, 30_000_000));
    expect(
      screen.getByText("No unit in Amarr keeps a 5% margin at today's prices.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/profit each/)).not.toBeInTheDocument();
  });
});

describe('HaulingItemDetail — instant', () => {
  it('shows the buy orders it sells into and no Days to Sell', async () => {
    const user = userEvent.setup();
    renderDetail(instantRow());
    expect(screen.getByText('Buy orders in Jita')).toBeInTheDocument();
    expect(screen.queryByText('Sells in')).not.toBeInTheDocument();
    expect(screen.queryByText(/sold a day/)).not.toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      '130.00',
      '125.00',
      '90.00',
    ]);
    expect(screen.getByText('Pay at most')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show the math' }));
    expect(screen.getByText('Sales tax')).toBeInTheDocument();
    expect(screen.queryByText('Broker fee')).not.toBeInTheDocument();
  });
});
