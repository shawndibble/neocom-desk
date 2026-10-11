import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Panel';

const meta = {
  title: 'ui/Panel',
  component: Panel,
  tags: ['autodocs'],
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A titled panel with body text. */
export const Titled: Story = {
  args: { title: 'Wallet balance', children: 'Body content sits here.' },
};

/** @summary A header with a one-line meta read beside the title. */
export const WithMeta: Story = {
  args: {
    title: 'Active jobs',
    meta: <span className="text-xs text-text-dim">12 running</span>,
    children: 'Body content sits here.',
  },
};

/** @summary Unpadded body, for flush content such as a table. */
export const Flush: Story = {
  args: { title: 'Flush', padded: false, children: <div className="p-1">Edge to edge</div> },
};
