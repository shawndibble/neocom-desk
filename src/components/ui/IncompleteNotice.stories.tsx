import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { IncompleteNotice } from './IncompleteNotice';

/**
 * @summary "Incomplete data — …" amber line above a view whose fetch was truncated, with an optional hint and Retry.
 */
const meta = {
  title: 'ui/IncompleteNotice',
  component: IncompleteNotice,
  tags: ['autodocs'],
} satisfies Meta<typeof IncompleteNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The title alone, when the view has nothing to add. */
export const TitleOnly: Story = {};

/** @summary With a hint naming what is missing (the wallet's page cap). */
export const WithHint: Story = {
  args: { hint: 'Older entries are past the page limit and not shown.' },
};

/** @summary With a Retry that refetches the missing pages. */
export const WithRetry: Story = {
  args: {
    hint: 'showing 2,500 items',
    action: <Button size="sm">Retry</Button>,
  },
};
