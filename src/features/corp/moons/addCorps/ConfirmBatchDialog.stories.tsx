import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { ConfirmBatchDialog } from './ConfirmBatchDialog';

const meta = {
  title: 'corp/ConfirmBatchDialog',
  component: ConfirmBatchDialog,
  parameters: { layout: 'fullscreen' },
  args: { corps: CORPS, onBack: () => {}, onConnect: () => {}, onClose: () => {} },
} satisfies Meta<typeof ConfirmBatchDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OneCorp: Story = { args: { corps: CORPS.slice(0, 1) } };

export const WithAlerts: Story = { args: { offerAlerts: true } };
