import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { SplitButtonChevron } from './SplitButtonChevron';

const meta = {
  title: 'ui/SplitButtonChevron',
  component: SplitButtonChevron,
  tags: ['autodocs'],
  args: { label: 'More save options' },
  render: (args) => (
    <div className="flex">
      <Button variant="primary" size={args.size} className="rounded-r-none">
        Save
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SplitButtonChevron {...args} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Save as new</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
} satisfies Meta<typeof SplitButtonChevron>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Beside a primary button at the default `md` tier. */
export const Default: Story = {};

/** @summary The `sm` tier, beside an `sm` primary button. */
export const Small: Story = { args: { size: 'sm' } };
