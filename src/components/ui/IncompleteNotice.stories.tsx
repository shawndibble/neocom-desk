import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { IncompleteNotice } from './IncompleteNotice';

const meta = {
  title: 'ui/IncompleteNotice',
  component: IncompleteNotice,
  tags: ['autodocs'],
} satisfies Meta<typeof IncompleteNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};

export const WithHint: Story = {
  args: { hint: 'Older entries are past the page limit and not shown.' },
};

export const WithRetry: Story = {
  args: {
    hint: 'showing 2,500 items',
    action: <Button size="sm">Retry</Button>,
  },
};
