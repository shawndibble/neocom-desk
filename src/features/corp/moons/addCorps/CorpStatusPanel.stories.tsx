import type { Meta, StoryObj } from '@storybook/react-vite';
import { CorpStatusPanel } from './CorpStatusPanel';

/** @summary Needs you (N): the corps that did not connect, each with its one-line reason and fix. */
const meta = {
  title: 'corp/CorpStatusPanel',
  component: CorpStatusPanel,
  parameters: { layout: 'padded' },
  args: {
    connected: 8,
    total: 12,
    items: [
      { corporationId: 18, name: 'Sable Ridge Extraction', state: 'needs-sign-in' },
      { corporationId: 19, name: 'Emberlight Group', state: 'own-book' },
      { corporationId: 20, name: 'Gantry Point Mining', state: 'needs-role' },
      { corporationId: 21, name: 'Wren Hollow Corp', state: 'gone-quiet' },
    ],
    onSignInAgain: () => {},
    onRemove: () => Promise.resolve(true),
  },
} satisfies Meta<typeof CorpStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary All four kinds: sign-in, own book (words only), role, gone quiet. */
export const Default: Story = {};

/** @summary A connection that failed on the way through shows its reason, not "log in again". */
export const Failed: Story = {
  args: {
    items: [
      { corporationId: 22, name: 'Dunmoor Freight', state: 'failed', reason: 'unknown' },
      {
        corporationId: 23,
        name: 'Wren Hollow Corp',
        state: 'failed',
        reason: 'ledger-unavailable',
      },
    ],
  },
};

/** @summary Nothing needs the player: the panel is gone. */
export const Empty: Story = { args: { items: [] } };
