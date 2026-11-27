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

async function seedHauling() {
  clearMarketPriceCache();
  clearOrderBookCache();
  clearHaulingScanCache();
  await db.settings.bulkPut([{ key: 'haulingCargo', value: MASTODON_CARGO }]);
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

export const Hauling: Story = {};

export const HaulingPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
