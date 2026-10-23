import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnsavedChangesBar } from './UnsavedChangesBar';

/**
 * @summary A pinned bar for a form with edits not yet saved: status line, Discard and Save; the line turns into the problem count while a field is invalid.
 */
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

/** @summary Edits waiting to be saved. */
export const Default: Story = {};

/** @summary A field is invalid: the line names the problems and Save is inert (still focusable). */
export const WithProblems: Story = { args: { problems: '2 problems to fix before saving' } };

/** @summary A save is running: Save shows its spinner. */
export const Saving: Story = { args: { saving: true } };
