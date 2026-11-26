import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { InfoTooltip, Tooltip } from './Tooltip';

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

export const Shown: Story = {
  args: { content: 'Refresh prices', children: refresh },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('button')).toHaveFocus();
  },
};

export const Resting: Story = {
  args: { content: 'Refresh prices', children: refresh },
};

export const OpenOnTap: Story = {
  args: { content: 'Tap to read, tap again to hide.', openOnTap: true, children: refresh },
};

export const Info: Story = {
  args: { content: 'x', children: <span /> },
  render: () => (
    <InfoTooltip label="About Material Efficiency" content="Cuts the materials a blueprint uses." />
  ),
};

export const InfoNote: Story = {
  args: { content: 'x', children: <span /> },
  render: () => (
    <InfoTooltip label="About this price" glyph="info" content="Median of the last 5 sales." />
  ),
};

export const NativeTitle: Story = {
  tags: ['!manifest'],
  args: { content: 'x', children: <span /> },
  render: () => (
    <button type="button" title="Refresh prices" className="rounded-sm border border-line p-2">
      Refresh
    </button>
  ),
};
