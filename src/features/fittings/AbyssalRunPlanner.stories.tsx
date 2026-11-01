import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AbyssalRunPlanner } from './AbyssalRunPlanner';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import type { FittingStats } from '@/engine/fittings/types';

const stats = (maxVelocity: number) =>
  ({ ehp: 20000, maxVelocity, offense: { weapons: [] } }) as unknown as FittingStats;

const compare = () => Promise.resolve({ before: stats(1200), after: stats(1518) });
const typeName = (typeId: number) => `Filament #${typeId}`;

/** Sets the session weather (and tier / security) before the planner mounts. */
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
  useAbyssalWeather.setState({ weatherTypeId });
  useAbyssalRunPlan.setState({ tier, security });
  useEffect(() => () => useAbyssalWeather.setState({ weatherTypeId: null }), []);
  return (
    <AbyssalRunPlanner hullGroupId={hullGroupId} compare={compare} cargo={[]} typeName={typeName} />
  );
}

/** @summary The Abyssal stats section's body: the weather picker, then the run planner. */
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

/** @summary A weather set: picker, effect on the fit, tier and security, one verdict line, Buy. */
export const WeatherSet: Story = {
  render: () => <Seeded weatherTypeId={47382} />,
};

/** @summary A problem only: a suspect flag is the one warning line; the rest stays plain. */
export const WithWarning: Story = {
  render: () => <Seeded weatherTypeId={47382} tier={5} security={7} hullGroupId={25} />,
};

/** @summary Normal space: the picker and one hint; tier, verdict and Buy wait for a weather. */
export const NormalSpace: Story = {
  render: () => <Seeded weatherTypeId={null} />,
};
