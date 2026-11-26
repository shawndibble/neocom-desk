import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Panel';
import { Toast } from './Toast';

const noop = () => {};

const meta = {
  title: 'ui/Toast',
  component: Toast,
  tags: ['autodocs'],
  args: { message: 'Copied multibuy list' },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = { args: { onClose: noop } };

export const WithUndo: Story = {
  args: {
    message: 'Plan deleted',
    undo: { label: 'Undo', onUndo: noop },
    onClose: noop,
  },
};

export const WithAction: Story = {
  args: {
    message: 'Appraisal saved',
    action: { label: 'Open', onAction: noop },
    onClose: noop,
  },
};

export const ToneSuccess: Story = {
  args: { message: 'Moon settings saved', tone: 'success', onClose: noop },
};

export const ToneDanger: Story = {
  args: { message: "Couldn't copy the multibuy list", tone: 'danger', onClose: noop },
};

export const OverPanel: Story = {
  args: {
    message: 'Auto-Integrity Preservation Seal moved to To buy',
    undo: { label: 'Undo', onUndo: noop },
    onClose: noop,
  },
  decorators: [
    (Story) => (
      <div className="bg-bg h-screen p-4">
        <Panel title="Materials" className="text-text h-full overflow-hidden text-sm">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="border-line flex justify-between border-b px-3 py-2">
              <span>Material {i + 1}</span>
              <span>1,738</span>
            </div>
          ))}
        </Panel>
        <Story />
      </div>
    ),
  ],
};
