import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Panel';
import { IconButton } from './IconButton';
import * as Icon from './icons';

const meta = {
  title: 'ui/Panel',
  component: Panel,
  tags: ['autodocs'],
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Titled: Story = {
  args: { title: 'Wallet balance', children: 'Body content sits here.' },
};

export const WithMeta: Story = {
  args: {
    title: 'Active jobs',
    meta: <span className="text-xs text-text-dim">12 running</span>,
    children: 'Body content sits here.',
  },
};

export const Flush: Story = {
  args: { title: 'Flush', padded: false, children: <div className="p-1">Edge to edge</div> },
};

export const WithActions: Story = {
  args: {
    title: 'Open orders',
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
    children: 'Body content sits here.',
  },
};

export const NestedPanel: Story = {
  tags: ['!manifest'],
  args: {
    title: 'Outer',
    children: <Panel title="Inner">Nested</Panel>,
  },
};
