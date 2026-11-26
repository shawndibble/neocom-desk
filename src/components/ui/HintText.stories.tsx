import type { Meta, StoryObj } from '@storybook/react-vite';
import { HintText } from './HintText';

const meta = {
  title: 'ui/HintText',
  component: HintText,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="h-32 w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HintText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { content: 'Manufacturing job cost index', children: 'MJCI' },
};

export const Toned: Story = {
  args: { content: 'Below the going rate', children: 'Underpriced', className: 'text-danger' },
};

export const DesktopOnly: Story = {
  args: { content: 'Full station name', children: 'Jita IV - Moon 4', desktopOnly: true },
};

export const OnlyWhenTruncated: Story = {
  args: {
    content: 'Bureau of Unified Harvesting',
    children: 'Bureau of Unified Harvesting',
    onlyWhenTruncated: true,
  },
  render: (args) => (
    <div className="space-y-2">
      <div className="w-32 truncate">
        <HintText {...args}>Bureau of Unified Harvesting</HintText>
      </div>
      <div className="w-64 truncate">
        <HintText {...args}>Bureau of Unified Harvesting</HintText>
      </div>
    </div>
  ),
};
