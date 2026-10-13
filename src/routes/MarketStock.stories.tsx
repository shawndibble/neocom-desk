import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { db } from '@/db';
import type { StockList } from '@/engine/stockTargets/stockLists';
import { SYNCED_STOCK_LISTS_KEY, useStockLists } from '@/features/stockTargets/stockListsStore';
import { stockFixtureRoutes, SAMPLE_STOCK_LISTS, STOCK_SCOPES } from '@/storybook/stockFixtures';
import { Market } from './Market';

/** Writes the sample markets; the store is module state, so it re-reads them. */
async function seedLists(lists: readonly StockList[]) {
  await db.settings.put({ key: SYNCED_STOCK_LISTS_KEY, value: lists });
  useStockLists.setState({ hydrated: false });
}
const seedAll = () => seedLists(SAMPLE_STOCK_LISTS);
const seedOne = () => seedLists(SAMPLE_STOCK_LISTS.slice(0, 1));
const seedNone = () => seedLists([]);

const shell = (path: string, seed: () => Promise<void>) => ({
  path,
  routes: stockFixtureRoutes,
  scopes: STOCK_SCOPES,
  seed,
});

const meta = {
  title: 'pages/Market Stock',
  component: Market,
  parameters: { layout: 'fullscreen', shell: shell('/market/stock', seedAll) },
  render: () => (
    <Routes>
      <Route path="market/*" element={<Market />} />
    </Routes>
  ),
} satisfies Meta<typeof Market>;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Market › Stock landing: every market the pilot stocks, worst first. */
export const Markets: Story = {};

/** @summary The market list in the phone shell. */
export const MarketsPhone: Story = { globals: phone };

/** @summary One market's Stock List: each Stock Target against listed and hangar stock. */
export const OneMarket: Story = {
  parameters: { shell: shell('/market/stock', seedOne) },
};

/** @summary One market's Stock List in the phone shell. */
export const OneMarketPhone: Story = {
  parameters: { shell: shell('/market/stock', seedOne) },
  globals: phone,
};

/** @summary No markets yet: the first-run empty state. */
export const Empty: Story = {
  parameters: { shell: shell('/market/stock', seedNone) },
};
