import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

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

export const Informational: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <PopoverContent align="start" aria-label="Breakdown" className="w-64 p-3 text-sm">
          <p>Net profit after 3.6% broker fee and 4.5% sales tax.</p>
          <p className="mt-2 tabular-nums">Margin 12.4%</p>
        </PopoverContent>
      </>
    ),
  },
};

export const WithForm: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <PopoverContent align="start" aria-label="Sources" className="w-56 p-3 text-sm">
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

export const WithArrow: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        {trigger}
        <PopoverContent
          side="right"
          sideOffset={8}
          arrow
          aria-label="Update ready"
          className="max-w-60 px-2 py-1.5 text-xs"
        >
          <p>A new version is ready.</p>
        </PopoverContent>
      </>
    ),
  },
};

export const Closed: Story = { args: { children: trigger } };
