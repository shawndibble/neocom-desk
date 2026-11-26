import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnsavedChangesBar } from './UnsavedChangesBar';

const meta = {
  title: 'ui/UnsavedChangesBar',
  component: UnsavedChangesBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    message: 'Unsaved changes',
    discardLabel: 'Discard',
    saveLabel: 'Save',
    onDiscard: () => undefined,
    onSave: () => undefined,
  },
} satisfies Meta<typeof UnsavedChangesBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithProblems: Story = { args: { problems: '2 problems to fix before saving' } };

export const Saving: Story = { args: { saving: true } };
