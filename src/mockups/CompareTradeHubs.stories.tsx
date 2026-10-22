import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { useCompareSet } from '@/features/market/compareSet';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { clearMarketPriceCache } from '@/market/prices';
import { Market } from '@/routes/Market';
import { HAULING_SCOPES } from '@/storybook/haulingFixtures';
import { COMPARE_ITEMS, compareHubFixtureRoutes } from './compareTradeHubsFixtures';
import { ProposedCompareDrawer } from './compareTradeHubsParts';

const BROWSER_PATH = `/market/browser?type=${COMPARE_ITEMS[0].typeId}&hub=jita`;

function resetCaches() {
  clearMarketPriceCache();
  clearOrderBookCache();
}

/** Today's drawer opens on Prices with the four extenders already in the set. */
async function seedToday() {
  resetCaches();
  useCompareSet.setState({ items: [...COMPARE_ITEMS], view: 'prices', openRequest: 0 });
  useCompareSet.getState().openIn('prices');
}

/** The set is filled but today's drawer stays closed under the proposed one. */
async function seedProposed() {
  resetCaches();
  useCompareSet.setState({ items: [...COMPARE_ITEMS], view: 'prices', openRequest: 0 });
}

async function seedSingle() {
  resetCaches();
  useCompareSet.setState({ items: [COMPARE_ITEMS[0]], view: 'prices', openRequest: 0 });
}

const shell = (seed: () => Promise<void>) => ({
  path: BROWSER_PATH,
  routes: compareHubFixtureRoutes,
  scopes: HAULING_SCOPES,
  seed,
});

const page = (
  <Routes>
    <Route path="market/*" element={<Market />} />
  </Routes>
);

/**
 * Compare drawer "Trade hubs" view (issue #4696): a third view beside Prices
 * and Attributes, with Compare Set items as rows and the five Trade Hubs as
 * columns. Each cell is that hub's best sell (the cell's one link, into the
 * Market browser at that hub) over its best buy; the row's lowest sell and
 * highest buy carry a word as well as colour. Hub headers give jumps from the
 * pilot and mark the pilot's own Market hub. `Today*` stories are the real
 * page as it renders now.
 *
 * New components in this mockup: `TradeHubsTable` (a `DataTable` with a
 * `TradeHubCell` per hub). The drawer chrome and segmented control are
 * today's, with a third option.
 */
const meta = {
  title: 'mockups/Compare Trade Hubs',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: shell(seedToday) },
  render: () => page,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today: Market Browser with the Compare drawer open on Prices, priced at one hub (Jita). */
export const Today: Story = {};

/** @summary Today on a phone: the drawer is a full-screen sheet; the Prices table scrolls sideways. */
export const TodayPhone: Story = { globals: PHONE };

/** @summary Proposed: Trade hubs view, four items × five hubs, Hek still loading, Rens has no sellers for one item. */
export const Proposed: Story = {
  parameters: { shell: shell(seedProposed) },
  render: () => (
    <>
      {page}
      <ProposedCompareDrawer items={COMPARE_ITEMS} loadingHubs={['hek']} />
    </>
  ),
};

/** @summary Proposed on a phone: a table like Prices, scrolling sideways with the item column pinned. */
export const ProposedPhone: Story = {
  globals: PHONE,
  parameters: { shell: shell(seedProposed) },
  render: () => (
    <>
      {page}
      <ProposedCompareDrawer items={COMPARE_ITEMS} fullScreen />
    </>
  ),
};

/**
 * @summary Open question: with one item in the set, the drawer opens on Trade hubs (Prices of one item compares nothing).
 */
export const SingleItem: Story = {
  parameters: { shell: shell(seedSingle) },
  render: () => (
    <>
      {page}
      <ProposedCompareDrawer
        items={[COMPARE_ITEMS[0]]}
        note="Open question: the item's Compare button only adds to the set (it doesn't open the drawer). Proposal: when the set holds one item, opening the drawer lands on Trade hubs, since Prices for one item compares nothing."
      />
    </>
  ),
};
