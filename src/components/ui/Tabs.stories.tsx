import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabPanel } from './Tabs';
import { useTabsId } from './tabPanel';

const tabs = [
  { id: 'open', label: 'Open' },
  { id: 'history', label: 'History' },
];

const meta = {
  title: 'ui/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: { tabs, value: 'open', label: 'Orders', tabsId: 'story', onChange: () => {} },
  render: function Render(args) {
    const tabsId = useTabsId();
    const [value, setValue] = useState(args.value);
    return (
      <>
        <Tabs {...args} tabsId={tabsId} value={value} onChange={setValue} />
        <TabPanel tabsId={tabsId} tabId={value} className="pt-3 text-sm">
          {args.tabs.find((tab) => tab.id === value)?.label} content
        </TabPanel>
      </>
    );
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const WithCount: Story = {
  args: {
    tabs: [
      { id: 'blueprints', label: 'Blueprints' },
      { id: 'members', label: 'Members', count: 12 },
    ],
    value: 'blueprints',
    label: 'Community',
  },
};

export const WithToneCount: Story = {
  args: {
    tabs: [
      { id: 'all', label: 'All', count: 120 },
      { id: 'deliveries', label: 'Corp deliveries', count: 4, countTone: 'warning' },
      { id: 'impounded', label: 'Impounded', count: 2, countTone: 'danger' },
    ],
    value: 'all',
    label: 'Corporation assets',
  },
};

export const OverflowOnPhone: Story = {
  args: {
    tabs: ['Overview', 'Skills', 'Implants', 'Standings', 'Contracts', 'Wallet', 'Loyalty'].map(
      (label) => ({ id: label.toLowerCase(), label })
    ),
    value: 'overview',
  },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const OverflowWithPointer: Story = {
  args: OverflowOnPhone.args,
  decorators: [
    (Story) => (
      <div className="w-[26rem]">
        <Story />
      </div>
    ),
  ],
};

export const ManualActivation: Story = { args: { activation: 'manual' } };
