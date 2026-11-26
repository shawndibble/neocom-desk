import type { Meta, StoryObj } from '@storybook/react-vite';
import { CorpStatusPanel } from './CorpStatusPanel';

const meta = {
  title: 'corp/CorpStatusPanel',
  component: CorpStatusPanel,
  parameters: { layout: 'padded' },
  args: {
    connected: 8,
    total: 12,
    items: [
      {
        corporationId: 18,
        name: 'Sable Ridge Extraction',
        state: 'needs-sign-in',
        ceoName: 'Mira Voss',
      },
      { corporationId: 19, name: 'Emberlight Group', state: 'own-book' },
      { corporationId: 20, name: 'Gantry Point Mining', state: 'needs-role' },
      { corporationId: 21, name: 'Wren Hollow Corp', state: 'gone-quiet', ceoName: 'Mira Voss' },
      { corporationId: 22, name: 'Dusk Anchor Group', state: 'gone-quiet' },
    ],
    onSignInAgain: () => {},
    onGrantAgain: () => {},
    onRemove: () => Promise.resolve(true),
  },
} satisfies Meta<typeof CorpStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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

export const RefineryNames: Story = {
  args: {
    items: [
      {
        corporationId: 24,
        name: 'Sable Ridge Extraction',
        state: 'needs-names',
        ceoName: 'Mira Voss',
      },
      { corporationId: 25, name: 'Brightwater Holdings', state: 'names-not-shared' },
    ],
  },
};

export const ChunkOre: Story = {
  args: {
    items: [
      {
        corporationId: 26,
        name: 'Sable Ridge Extraction',
        state: 'needs-ore',
        ceoName: 'Mira Voss',
      },
      { corporationId: 27, name: 'Gantry Point Mining', state: 'needs-ore', ceoName: 'Tov Arkane' },
    ],
  },
};

export const Empty: Story = { args: { items: [] } };
