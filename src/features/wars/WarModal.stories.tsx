import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StoredWar, WarAgainstMe } from '@/engine/wars';
import { WarModal } from './WarModal';
import { HOUR_MS } from '@/lib/age';
import { seedCachedNames } from '@/features/character/names';

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

const meta = {
  title: 'wars/WarModal',
  component: WarModal,
  args: { open: true, onClose: () => undefined, wars: [active()] },
  loaders: [
    () =>
      seedCachedNames({
        1: 'Hired Guns',
        2: 'Mercenary Coalition',
        99005338: 'Pandemic Horde',
        98000001: 'Neocom Logistics',
        98000002: 'Red Frog Raiders',
        98000003: 'Blood Moon Syndicate',
        98000004: 'Quiet Haulers',
      }),
  ],
} satisfies Meta<typeof WarModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

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

export const SeveralCorporations: Story = {
  args: {
    nameCorporation: true,
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
