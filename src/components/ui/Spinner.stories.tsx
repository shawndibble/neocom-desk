import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './Spinner';

/**
 * Accent arc for a load in progress. Behaviour cue (§6a, §6c Loading): a spinner
 * with the cached data's `DataAgeBadge`, never a skeleton.
 *
 * @summary Inline or centred loading indicator.
 */
const meta = {
  title: 'ui/Spinner',
  component: Spinner,
  tags: ['autodocs'],
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Loading cue (§6c): the default `md` arc, announced as "Loading" via `role="status"`. */
export const Default: Story = {};

/** @summary Loading cue (§6c): `sm` is the size inside a `Button loading`. */
export const Small: Story = { args: { size: 'sm' } };

/** @summary Loading cue (§6c): `lg` for a view that is waiting on its only content. */
export const Large: Story = { args: { size: 'lg', label: 'Loading plan' } };

/**
 * @summary Loading cue (§6c): `delayMs` holds the arc back so a cache-served load never flashes
 * one; a same-size silent placeholder keeps the space.
 */
export const Delayed: Story = { args: { delayMs: 200 } };

/** @summary Loading cue (§6c): `block="page"` centres the arc with `py-16` for a view waiting on its only content. */
export const PageBlock: Story = { args: { block: 'page' } };

/** @summary Loading cue (§6c): `block="panel"` is the tighter `py-8` row inside a card or modal. */
export const PanelBlock: Story = { args: { block: 'panel' } };
