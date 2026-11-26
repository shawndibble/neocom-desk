import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AbyssalRunPlanner } from './AbyssalRunPlanner';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { FittingStats } from '@/engine/fittings/types';
import { installFixtureFetch } from '@/storybook/fixtureFetch';

const before = baseFittingStats();
const after: FittingStats = {
  ...before,
  navigation: { ...before.navigation, maxVelocity: before.navigation.maxVelocity + 318 },
};
const compare = () => Promise.resolve({ before, after });
const typeName = (typeId: number) => `Filament #${typeId}`;

function useFilamentPriceFixture() {
  const [uninstall] = useState(() =>
    installFixtureFetch([
      {
        path: '/aggregates/',
        respond: ({ url }) => ({
          body: Object.fromEntries(
            (url.searchParams.get('types') ?? '')
              .split(',')
              .map((id) => [id, { sell: { min: '1450000', volume: '12', orderCount: '3' } }])
          ),
        }),
      },
    ])
  );
  useEffect(() => uninstall, [uninstall]);
}

function Seeded({
  weatherTypeId,
  tier = 3,
  security = 8,
  hullGroupId = 26,
}: {
  weatherTypeId: number | null;
  tier?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  security?: 0 | 5 | 6 | 7 | 8 | 9 | 10;
  hullGroupId?: number;
}) {
  useFilamentPriceFixture();
  useAbyssalWeather.setState({ weatherTypeId });
  useAbyssalRunPlan.setState({ tier, security });
  useEffect(() => () => useAbyssalWeather.setState({ weatherTypeId: null }), []);
  return (
    <AbyssalRunPlanner hullGroupId={hullGroupId} compare={compare} cargo={[]} typeName={typeName} />
  );
}

const meta = {
  title: 'fittings/AbyssalRunPlanner',
  component: AbyssalRunPlanner,
  tags: ['autodocs'],
  args: { hullGroupId: 26, compare, cargo: [], typeName },
  decorators: [
    (Story) => (
      <div className="w-[22rem] max-w-full border border-line bg-panel p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AbyssalRunPlanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeatherSet: Story = {
  render: () => <Seeded weatherTypeId={47382} />,
};

export const WithWarning: Story = {
  render: () => <Seeded weatherTypeId={47382} tier={5} security={7} hullGroupId={25} />,
};

export const NormalSpace: Story = {
  render: () => <Seeded weatherTypeId={null} />,
};
