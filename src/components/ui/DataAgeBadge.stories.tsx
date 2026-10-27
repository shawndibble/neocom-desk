import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataAgeBadge } from './DataAgeBadge';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const meta = {
  title: 'ui/DataAgeBadge',
  component: DataAgeBadge,
  tags: ['autodocs'],
  args: { date: ago(12), alwaysVisible: true },
} satisfies Meta<typeof DataAgeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Fresh data: under an hour, dim text. */
export const Fresh: Story = {};

/** @summary Over an hour old: amber. */
export const Stale: Story = { args: { date: ago(180) } };

/** @summary Over a day old: red. */
export const VeryStale: Story = { args: { date: ago(60 * 30) } };

/** @summary Only the dot; the exact age moves into the tooltip. For tight rows. */
export const DotOnly: Story = { args: { dotOnly: true } };

/** @summary A sentence about this view's refresh cadence, added to the tooltip. */
export const WithNote: Story = { args: { note: 'CCP caches corp data for about an hour.' } };
