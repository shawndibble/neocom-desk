import type { Meta, StoryObj } from '@storybook/react-vite';
import { RemoveNowView } from './RemoveNowPage';

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

export const SignedOut: Story = { args: { screen: 'signed-out' } };

export const Checking: Story = { args: { screen: 'loading' } };

export const Available: Story = {};

export const AvailableNoTime: Story = { args: { at: null } };

export const Working: Story = { args: { working: true } };

export const Done: Story = { args: { screen: 'done' } };

export const Unavailable: Story = { args: { screen: 'unavailable' } };

export const Failed: Story = { args: { screen: 'failed' } };
