import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from './Toast';

const noop = () => {};

/**
 * Fixed-position confirmation, portalled to the body. Feedback cue (§6c
 * Undo): a plain note expires; one offering Undo or an action stays until dismissed.
 *
 * @summary Transient confirmation floating above the tab bar.
 */
const meta = {
  title: 'ui/Toast',
  component: Toast,
  tags: ['autodocs'],
  args: { message: 'Copied multibuy list' },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Feedback cue (§6c Undo): a plain note ("Copied") that expires; hover or focus pauses it. */
export const Plain: Story = { args: { onClose: noop } };

/** @summary Feedback cue (§6c Undo): an Undo link; stays until closed, Escape or a route change. */
export const WithUndo: Story = {
  args: {
    message: 'Plan deleted',
    undo: { label: 'Undo', onUndo: noop },
    onClose: noop,
  },
};

/** @summary Feedback cue (§6c Undo): one follow-up action ("Open") on a persistent toast. */
export const WithAction: Story = {
  args: {
    message: 'Appraisal saved',
    action: { label: 'Open', onAction: noop },
    onClose: noop,
  },
};

/** @summary Feedback cue (§6c Undo): over a panel, where it must still stand out from the page. */
export const OverPanel: Story = {
  args: {
    message: 'Auto-Integrity Preservation Seal moved to To buy',
    undo: { label: 'Undo', onUndo: noop },
    onClose: noop,
  },
  decorators: [
    (Story) => (
      <div className="bg-bg h-screen p-4">
        <div className="bg-panel border-line text-text-dim h-full rounded-xs border p-4 text-sm">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="border-line flex justify-between border-b py-2">
              <span className="text-accent">Material {i + 1}</span>
              <span>1,738</span>
            </div>
          ))}
        </div>
        <Story />
      </div>
    ),
  ],
};
