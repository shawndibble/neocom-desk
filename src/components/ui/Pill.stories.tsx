import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './Pill';

/** @summary A static tinted badge beside a name or status. */
const meta = {
  title: 'ui/Pill',
  component: Pill,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The quiet default, for a plain tag such as "Corp". */
export const Neutral: Story = {
  args: { children: 'Corp' },
};

/** @summary A state from the user's own choices, such as "In plan". */
export const Accent: Story = {
  args: { tone: 'accent', children: 'In plan' },
};

/** @summary A finished or healthy state. */
export const Success: Story = {
  args: { tone: 'success', children: 'Done' },
};

/** @summary Something needing attention soon. */
export const Warning: Story = {
  args: { tone: 'warning', children: 'Completing soon' },
};

/** @summary A loss or failure. */
export const Danger: Story = {
  args: { tone: 'danger', children: '3 lost' },
};

/** @summary `outlined`: an edged badge at a fixed 18px height, for tags in a dense row (PI verbs, "Estimate"). */
export const Outlined: Story = {
  args: { outlined: true, tone: 'warning', children: 'Estimate' },
};

/** @summary Every tone, outlined. */
export const OutlinedTones: Story = {
  args: { children: 'Rebuild', outlined: true },
  render: () => (
    <div className="flex gap-2">
      <Pill outlined>Rebuild</Pill>
      <Pill outlined tone="accent">
        Add
      </Pill>
      <Pill outlined tone="success">
        Done
      </Pill>
      <Pill outlined tone="warning">
        Remove
      </Pill>
      <Pill outlined tone="danger">
        Lost
      </Pill>
    </div>
  ),
};
