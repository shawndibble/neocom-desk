import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { bookSettingsValue } from './bookSettingsFixture';

/** @summary The book's settings: dated rates (corp, Guest, Miner, moon, refinery), pricing, grace and Statements. */
const meta = {
  title: 'corp/BookSettingsDialog',
  component: BookSettingsDialog,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: () => {} },
  decorators: [
    (Story) => (
      <BookProvider value={bookSettingsValue()}>
        <Story />
      </BookProvider>
    ),
  ],
} satisfies Meta<typeof BookSettingsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A per-refinery rate on a moon owner's refinery, which has no moon to set a rate on. */
export const RefineryRate: Story = {};

/** @summary Pricing & billing: trade hub, Ore Form, cadence, minimum Statement, grace, overdue and divisions. */
export const PricingAndBilling: Story = { args: { initialTab: 'billing' } };

/** @summary Extractions: the chunk-rate fallback and each refinery's measured rate and field expiry. */
export const Extractions: Story = { args: { initialTab: 'extractions' } };

/** @summary Access & sync: the approval limit, Automatic sync, reclaiming and deleting the book. */
export const AccessAndSync: Story = { args: { initialTab: 'access' } };
