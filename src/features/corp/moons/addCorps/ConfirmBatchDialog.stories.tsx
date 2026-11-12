import type { Meta, StoryObj } from '@storybook/react-vite';
import { CORPS } from './addCorpsFixtures';
import { ConfirmBatchDialog } from './ConfirmBatchDialog';

/** @summary Step 2 of Add my other corps: one confirm for the batch, with How far back. */
const meta = {
  title: 'corp/ConfirmBatchDialog',
  component: ConfirmBatchDialog,
  parameters: { layout: 'fullscreen' },
  args: { corps: CORPS, onBack: () => {}, onConnect: () => {}, onClose: () => {} },
} satisfies Meta<typeof ConfirmBatchDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Twelve corps, From today. */
export const Default: Story = {};

/** @summary One corp. */
export const OneCorp: Story = { args: { corps: CORPS.slice(0, 1) } };

/** @summary Closed-app alerts are on for the account: one switch chains each CEO's alerts approval. */
export const WithAlerts: Story = { args: { offerAlerts: true } };
