import type { Meta, StoryObj } from '@storybook/react-vite';
import { Radio } from './Radio';

const meta = {
  title: 'ui/Radio',
  component: Radio,
  tags: ['autodocs'],
  render: (args) => (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 text-text-dim">Sell at</legend>
      {['Jita', 'Amarr', 'Dodixie'].map((hub, index) => (
        <label key={hub} className="inline-flex items-center gap-2">
          <Radio {...args} name="hub" value={hub} defaultChecked={index === 0} />
          {hub}
        </label>
      ))}
    </fieldset>
  ),
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Group: Story = {};

export const Disabled: Story = { args: { disabled: true } };
