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

/** @summary Header controls at the right: `actions` hold `IconButton`s that act on the panel. */
export const WithActions: Story = {
  args: {
    title: 'Open orders',
    actions: <IconButton label="Refresh" icon={<Icon.Refresh />} />,
    children: 'Body content sits here.',
  },
};

/**
 * Do not nest a Panel in a Panel: use a `panel-2` fill inside instead. Kept
 * as a warning, not a pattern.
 *
 * @summary Anti-pattern: a Panel nested in a Panel.
 */
export const NestedPanel: Story = {
  tags: ['!manifest'],
  args: {
    title: 'Outer',
    children: <Panel title="Inner">Nested</Panel>,
  },
};
