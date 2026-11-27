import type { Meta, StoryObj } from '@storybook/react-vite';
import { Radio } from './Radio';

/**
 * @summary Native radio with the accent colour: pick exactly one of a few options sharing a `name`.
 */
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

/** @summary A group in a labelled fieldset; one option is always on (§6c States, Selected). */
export const Group: Story = {};

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed` on every option. */
export const Disabled: Story = { args: { disabled: true } };
