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

/** @summary Two peer views on one page; the selected tab has an accent underline. */
export const Basic: Story = {};

/** @summary A tab that holds a countable list shows how many in a round badge after its label. */
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

/** @summary A count can be toned when it is work waiting (`warning`) or something to recover (`danger`); the number always prints. */
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

/** @summary More tabs than fit: the bar scrolls sideways instead of squeezing. Shown at 390 wide. */
export const OverflowOnPhone: Story = {
  args: {
    tabs: ['Overview', 'Skills', 'Implants', 'Standings', 'Contracts', 'Wallet', 'Loyalty'].map(
      (label) => ({ id: label.toLowerCase(), label })
    ),
    value: 'overview',
  },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary The same overflow in a narrow desktop frame: a pointer gets edge chevrons and wheel travel instead of a swipe. */
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

/** @summary Manual activation: arrows move focus only, Enter or Space selects. Use when `onChange` navigates. */
export const ManualActivation: Story = { args: { activation: 'manual' } };
