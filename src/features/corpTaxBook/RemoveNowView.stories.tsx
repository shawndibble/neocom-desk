import type { Meta, StoryObj } from '@storybook/react-vite';
import { RemoveNowView } from './RemoveNowPage';

/** @summary The payee's "Remove now" page, one screen per state. Every case where the link cannot be used reads the same. */
const meta = {
  title: 'corpTaxBook/RemoveNowPage',
  component: RemoveNowView,
  parameters: { layout: 'fullscreen' },
  args: {
    screen: 'available',
    accounting: 'Brass Meridian Logistics',
    owner: 'Ostrava Salvage',
    at: Date.UTC(2026, 9, 18, 14, 22),
    onLogIn: () => {},
    onRemove: () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof RemoveNowView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Behind an EVE sign-in: nobody is logged in on this device. */
export const SignedOut: Story = { args: { screen: 'signed-out' } };

/** @summary Asking the server about the link. */
export const Checking: Story = { args: { screen: 'loading' } };

/** @summary The link works: when the removal takes effect, and Remove now. */
export const Available: Story = {};

/** @summary The link works and the time is not known. */
export const AvailableNoTime: Story = { args: { at: null } };

/** @summary Remove now was pressed and is in flight. */
export const Working: Story = { args: { working: true } };

/** @summary The removal ended. */
export const Done: Story = { args: { screen: 'done' } };

/** @summary Expired, over, not this character, unknown or garbled: one neutral message, never why. */
export const Unavailable: Story = { args: { screen: 'unavailable' } };

/** @summary The server could not be reached: Try again. */
export const Failed: Story = { args: { screen: 'failed' } };
