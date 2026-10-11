import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { InfoTooltip, Tooltip } from './Tooltip';

/**
 * @summary Collision-aware hover/focus bubble on Radix (docs/adr/0008). §6c Tooltips: use
 * `Tooltip`, `InfoTooltip` or `HintText`, never native `title=`; content is never essential.
 */
const meta = {
  title: 'ui/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="flex h-40 w-72 items-end justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

const refresh = <IconButton icon={<Icon.Refresh />} label="Refresh prices" />;

/** @summary Shown: focusing the trigger reveals the bubble, as a keyboard user would (§6c Tooltips). */
export const Shown: Story = {
  args: { content: 'Refresh prices', children: refresh },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('button')).toHaveFocus();
  },
};

/** @summary At rest: the trigger alone; hover or focus reveals the bubble. */
export const Resting: Story = {
  args: { content: 'Refresh prices', children: refresh },
};

/**
 * @summary `openOnTap`: a trigger whose only job is explaining, so a plain tap on a phone reveals
 * the bubble (§6c Touch and hold). Leave off when the tap does something.
 */
export const OpenOnTap: Story = {
  args: { content: 'Tap to read, tap again to hide.', openOnTap: true, children: refresh },
};

/** @summary `InfoTooltip`: the "?" circle that explains a term (§6c: a tooltip, never a dialog). */
export const Info: Story = {
  args: { content: 'x', children: <span /> },
  render: () => (
    <InfoTooltip label="About Material Efficiency" content="Cuts the materials a blueprint uses." />
  ),
};

/** @summary `InfoTooltip` with `glyph="info"`: an "i" for a note on a value rather than jargon. */
export const InfoNote: Story = {
  args: { content: 'x', children: <span /> },
  render: () => (
    <InfoTooltip label="About this price" glyph="info" content="Median of the last 5 sales." />
  ),
};

/**
 * @summary Anti-pattern (§6c Tooltips): a native `title=` is unreachable on touch, keyboard and
 * screen readers. Use `Tooltip` instead.
 */
export const NativeTitle: Story = {
  tags: ['!manifest'],
  args: { content: 'x', children: <span /> },
  render: () => (
    <button type="button" title="Refresh prices" className="rounded-sm border border-line p-2">
      Refresh
    </button>
  ),
};
