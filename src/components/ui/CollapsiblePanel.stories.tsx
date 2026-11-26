import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CollapsiblePanel } from './CollapsiblePanel';

const meta = {
  title: 'ui/CollapsiblePanel',
  component: CollapsiblePanel,
  tags: ['autodocs'],
  args: {
    title: 'Active jobs',
    meta: <span className="text-xs text-text-dim">3 running</span>,
    labels: { show: 'Show jobs', hide: 'Hide jobs' },
    expanded: true,
    onToggle: () => {},
    children: 'Detail rows sit here.',
  },
  render: function Render(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return (
      <CollapsiblePanel {...args} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
    );
  },
} satisfies Meta<typeof CollapsiblePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Folded: Story = { args: { expanded: false } };

export const FoldedWithSummary: Story = {
  args: {
    expanded: false,
    collapsedSummary: <span className="text-sm">Next finish in 2h 10m</span>,
  },
};
