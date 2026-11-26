import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextArea } from './TextArea';

const meta = {
  title: 'ui/TextArea',
  component: TextArea,
  tags: ['autodocs'],
  args: { 'aria-label': 'Notes', rows: 4, placeholder: 'Anything to remember about this plan' },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mono: Story = {
  args: { mono: true, defaultValue: '[Rifter, Fit]\nDamage Control II' },
};

export const SubmitChord: Story = { args: { onSubmitChord: () => {} } };

export const Invalid: Story = { args: { defaultValue: 'bad paste', 'aria-invalid': true } };

export const Disabled: Story = { args: { disabled: true, defaultValue: 'Locked' } };

export const Bare: Story = {
  args: { bare: true, mono: true, defaultValue: '<b>bold</b> text' },
  decorators: [
    (Story) => (
      <div className="rounded-xs border border-line">
        <Story />
      </div>
    ),
  ],
};
