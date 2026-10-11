import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

/**
 * @summary Click-triggered panel with a `dialog` role for prose, figures or a small form (docs/adr/0004).
 * §6c: a trigger that opens one is field chrome with a trailing `CaretDown`, never a dotted
 * underline (that means "has a tooltip").
 */
const meta = {
  title: 'ui/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="h-64 w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

const trigger = (
  <PopoverTrigger asChild>
    <Button>Breakdown</Button>
  </PopoverTrigger>
);

/** @summary Informational panel open: prose and figures, no commands (a menu role would promise arrow-key items). */
export const Informational: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <PopoverContent align="start" className="w-64 p-3 text-sm">
          <p>Net profit after 3.6% broker fee and 4.5% sales tax.</p>
          <p className="mt-2 tabular-nums">Margin 12.4%</p>
        </PopoverContent>
      </>
    ),
  },
};

/** @summary A small form a menu cannot host: checkboxes that keep their own arrow keys. */
export const WithForm: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <PopoverContent align="start" className="w-56 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Wallet
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" /> Skill queue
          </label>
        </PopoverContent>
      </>
    ),
  },
};

/** @summary Closed at rest: the trigger alone. */
export const Closed: Story = { args: { children: trigger } };
