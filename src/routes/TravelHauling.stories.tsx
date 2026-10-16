import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { db } from '@/db';
import { useHaulingCargo } from '@/features/market/haulingCargo';
import {
  haulingFixtureRoutes,
  HAULING_PATH,
  HAULING_SCOPES,
  MASTODON_CARGO,
} from '@/storybook/haulingFixtures';
import { Travel } from './Travel';

/** A Mastodon as the Cargo Space, the intro read; the store is module state, so it re-reads them. */
async function seedHauling() {
  await db.settings.bulkPut([
    { key: 'haulingCargo', value: MASTODON_CARGO },
    { key: 'haulingIntroDismissed', value: true },
  ]);
  useHaulingCargo.setState({ hydrated: false });
}

const meta = {
  title: 'pages/Travel Hauling',
  component: Travel,
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
      <Route path="travel/*" element={<Travel />} />
    </Routes>
  ),
} satisfies Meta<typeof Travel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Travel › Hauling: an Amarr → Jita ammo scan planned into a Mastodon's hold. */
export const Hauling: Story = {};

/** @summary The same Amarr → Jita scan in the phone shell. */
export const HaulingPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
