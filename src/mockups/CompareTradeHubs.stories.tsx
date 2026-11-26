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

async function seedToday() {
  resetCaches();
  useCompareSet.setState({ items: [...COMPARE_ITEMS], view: 'prices', openRequest: 0 });
  useCompareSet.getState().openIn('prices');
}

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

const meta = {
  title: 'mockups/Compare Trade Hubs',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: shell(seedToday) },
  render: () => page,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'mobile1', isRotated: false } };

export const Today: Story = {};

export const TodayPhone: Story = { globals: PHONE };

export const Proposed: Story = {
  parameters: { shell: shell(seedProposed) },
  render: () => (
    <>
      {page}
      <ProposedCompareDrawer items={COMPARE_ITEMS} loadingHubs={['hek']} />
    </>
  ),
};

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
