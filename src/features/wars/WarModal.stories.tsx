import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StoredWar, WarAgainstMe } from '@/engine/wars';
import { WarModal } from './WarModal';
import { HOUR_MS } from '@/lib/age';

const NOW = Date.UTC(2026, 9, 21, 12);

const war = (over: Partial<StoredWar> = {}): StoredWar => ({
  id: 763512,
  declared: NOW - 30 * HOUR_MS,
  started: NOW - 6 * HOUR_MS,
  mutual: false,
  openForAllies: false,
  aggressor: { allianceId: 99005338, iskDestroyed: 2_480_000_000, shipsKilled: 14 },
  defender: { corporationId: 98000001, iskDestroyed: 310_000_000, shipsKilled: 3 },
  allies: [],
  ...over,
});

const active = (over: Partial<StoredWar> = {}): WarAgainstMe => ({
  war: war(over),
  side: 'defender',
  status: { kind: 'active', endsIn: null },
  against: { corporationId: 98000001 },
});

/** @summary The war card a pilot opens from the War banner: who, when, and how it is going. */
const meta = {
  title: 'wars/WarModal',
  component: WarModal,
  args: { open: true, onClose: () => undefined, wars: [active()] },
} satisfies Meta<typeof WarModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary One running war on the pilot's corporation. */
export const Active: Story = {};

/** @summary A war declared but not started, with allies hired and an end already set. */
export const NotStartedWithAllies: Story = {
  args: {
    wars: [
      {
        war: war({
          started: NOW + 19 * HOUR_MS,
          finished: NOW + 9 * 24 * HOUR_MS,
          allies: [{ corporationId: 1 }, { allianceId: 2 }],
          aggressor: { corporationId: 98000002, iskDestroyed: 0, shipsKilled: 0 },
          defender: { corporationId: 98000001, iskDestroyed: 0, shipsKilled: 0 },
        }),
        side: 'defender',
        status: { kind: 'pending', startsIn: 19 * HOUR_MS },
        against: { corporationId: 98000001 },
      },
    ],
  },
};

/** @summary More than one war: one card each, newest declared first. */
export const SeveralWars: Story = {
  args: {
    wars: [
      active(),
      active({
        id: 763400,
        declared: NOW - 90 * HOUR_MS,
        mutual: true,
        aggressor: { corporationId: 98000003, iskDestroyed: 12_000_000, shipsKilled: 1 },
      }),
    ],
  },
};

/** @summary Wars on two of the account's corporations: the cards grouped under the corporation each is against, the active Character's first. */
export const SeveralCorporations: Story = {
  args: {
    wars: [
      active(),
      {
        ...active({
          id: 763600,
          declared: NOW - 12 * HOUR_MS,
          defender: { corporationId: 98000004, iskDestroyed: 0, shipsKilled: 0 },
        }),
        against: { corporationId: 98000004 },
      },
    ],
  },
};
