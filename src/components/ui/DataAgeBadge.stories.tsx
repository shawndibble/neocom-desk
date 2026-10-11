import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataAgeBadge } from './DataAgeBadge';

const ago = (ms: number) => new Date(Date.now() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Relative age of API-derived data, required on every ESI-backed view. Cue
 * (§6c Hint): the exact timestamp is a tooltip on the focusable `<time>`.
 * Hidden below `md` unless `alwaysVisible`.
 *
 * @summary Dot and relative age with a staleness tone.
 */
const meta = {
  title: 'ui/DataAgeBadge',
  component: DataAgeBadge,
  tags: ['autodocs'],
  args: { date: ago(12 * MIN), alwaysVisible: true },
} satisfies Meta<typeof DataAgeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Staleness tone (§7): under an hour is dim. */
export const Fresh: Story = {};

/** @summary Staleness tone (§7): one to 24 hours is warning amber; the age text carries it too. */
export const Stale: Story = { args: { date: ago(5 * HOUR) } };

/** @summary Staleness tone (§7): over a day is danger red. */
export const VeryStale: Story = { args: { date: ago(30 * HOUR) } };

/** @summary Hint cue (§6c): `note` adds a sentence about this view's refresh cadence to the tooltip. */
export const WithNote: Story = {
  args: { note: 'CCP caches corporation data for about an hour.' },
};

/** @summary Compact: `dotOnly` keeps the dot and tone, the age moves to the tooltip. */
export const DotOnly: Story = { args: { dotOnly: true } };

/** @summary Inside a button: `tooltip={false}` is plain text with no tab stop. */
export const NoTooltip: Story = { args: { tooltip: false } };
