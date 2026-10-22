import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { db } from '@/db';
import { useHaulingBudget, useHaulingCargo } from '@/features/market/haulingCargo';
import { clearHaulingScanCache } from '@/features/market/haulingData';
import { useHaulingFilterPref } from '@/features/market/haulingFilterPref';
import { clearOrderBookCache } from '@/features/market/orderBook';
import { clearMarketPriceCache } from '@/market/prices';
import {
  haulingFixtureRoutes,
  HAULING_PATH,
  HAULING_SCOPES,
  MASTODON_CARGO,
} from '@/storybook/haulingFixtures';
import { Market } from './Market';

/**
 * A Mastodon as the Cargo Space and the intro read. Prices, books and scans
 * are cached in module memory, where another story's fixtures (Market Stock
 * prices some of the same items) would outlive its shell; so are the page's
 * setting stores, which re-read the rows. The intro's store is the panel's
 * own and stays as the first story left it.
 */
async function seedHauling() {
  clearMarketPriceCache();
  clearOrderBookCache();
  clearHaulingScanCache();
  await db.settings.bulkPut([
    { key: 'haulingCargo', value: MASTODON_CARGO },
    { key: 'haulingIntroDismissed', value: true },
  ]);
  useHaulingCargo.setState({ hydrated: false });
  useHaulingBudget.setState({ hydrated: false });
  useHaulingFilterPref.setState({ hydrated: false });
}

const meta = {
  title: 'pages/Market Hauling',
  component: Market,
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: HAULING_PATH,
      routes: haulingFixtureRoutes,
      scopes: HAULING_SCOPES,
      seed: seedHauling,
    },
  },
  render: () => (
    <Routes>
      <Route path="market/*" element={<Market />} />
    </Routes>
  ),
} satisfies Meta<typeof Market>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Market › Hauling: an Amarr → Jita ammo scan planned into a Mastodon's hold. */
export const Hauling: Story = {};

/** @summary The same Amarr → Jita scan in the phone shell. */
export const HaulingPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
