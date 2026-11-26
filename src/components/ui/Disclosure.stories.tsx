import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CaretToggle } from './Disclosure';

const meta = {
  title: 'ui/CaretToggle',
  component: CaretToggle,
  tags: ['autodocs'],
  args: { expanded: false, label: 'Show details', onClick: () => {} },
  render: function Render(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return <CaretToggle {...args} expanded={expanded} onClick={() => setExpanded((e) => !e)} />;
  },
} satisfies Meta<typeof CaretToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folded: Story = {};

export const Open: Story = { args: { expanded: true, label: 'Hide details' } };
