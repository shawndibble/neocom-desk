import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Collapse } from './Collapse';

const meta = {
  title: 'ui/Collapse',
  component: Collapse,
  tags: ['autodocs'],
  args: {
    open: false,
    id: 'collapse-demo',
    className: 'border-t border-line p-4 text-sm',
    children: 'The form that edits the summary above slides in here.',
  },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <div className="rounded-xs border border-line bg-panel">
        <div className="flex justify-end px-4 py-2 text-xs">
          <button
            type="button"
            className="text-accent"
            aria-expanded={open}
            aria-controls={args.id}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide setup' : 'Edit setup'}
          </button>
        </div>
        <Collapse {...args} open={open} />
      </div>
    );
  },
} satisfies Meta<typeof Collapse>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Shut: only the toggle shows; the body is not mounted. */
export const Closed: Story = {};

/** @summary Open: the body sits attached under its toggle. */
export const Open: Story = { args: { open: true } };
