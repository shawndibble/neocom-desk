import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataAgeBadge,
  DropdownMenuItem,
  HeaderMoreMenu,
  IconButton,
  PageHeader,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { db } from '@/db';
import { CharacterFilterControl, type CharacterScopeChoice } from './CharacterFilterControl';

/** Sample Character ids for the stack; a portrait the image server lacks shows its fallback. */
const PILOT_IDS = [90000001, 2112625428, 91316135, 95465499, 96180548, 1338057886];

/** Seeds `count` Characters into Dexie, the roster the "All" stack reads. */
function seedRoster(count: number) {
  return async () => {
    // corporationId: an NPC corporation (Caldari Navy), so the Corporation story has a real logo.
    await db.characters.clear();
    await db.characters.bulkPut(
      PILOT_IDS.slice(0, count).map((characterId, index) => ({
        characterId,
        name: `Pilot ${index + 1}`,
        ownerHash: `story-${index}`,
        addedAt: index,
        corporationId: 1000035,
      }))
    );
    return {};
  };
}

/**
 * @summary The This character / All characters / Corporation picker, in the
 * `PageHeader` `scope` slot it belongs in (decision 20261022-123837).
 */
const meta = {
  title: 'character/CharacterFilterControl',
  component: CharacterFilterControl,
  tags: ['autodocs'],
  args: { activeCharacterId: PILOT_IDS[0], value: 'all', onChange: () => {}, characterCount: 4 },
  loaders: [seedRoster(4)],
} satisfies Meta<typeof CharacterFilterControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = (
  <>
    <Button variant="ghost">Export</Button>
    <IconButton label="Refresh" icon={<Icon.Refresh />} />
    <HeaderMoreMenu>
      <DropdownMenuItem>Page settings…</DropdownMenuItem>
      <DropdownMenuItem>Column presets…</DropdownMenuItem>
    </HeaderMoreMenu>
  </>
);

/**
 * The real picker first in the cluster, the same height as the `IconButton`s
 * beside it, and the same faces at every width. `missingNames` draws the
 * warning dot and drops that Character's face.
 *
 * @summary In a `PageHeader`'s `scope` slot, partial coverage, beside text and icon actions.
 */
export const InPageHeader: Story = {
  args: { missingNames: ['Pilot 2'] },
  render: (args) => (
    <PageHeader
      title="Market orders"
      meta={<DataAgeBadge date={new Date(Date.now() - 12 * 60_000)} />}
      scope={<CharacterFilterControl {...args} />}
      actions={actions}
    />
  ),
};

/** @summary The same header at 390 wide: the same faces at the 44px touch height, the row on one line. */
export const InPageHeaderPhone: Story = {
  ...InPageHeader,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary The same header at 768 wide: the same faces at 36px, level with Refresh. */
export const InPageHeaderTablet: Story = {
  ...InPageHeader,
  globals: { viewport: { value: 'tablet768', isRotated: false } },
};

/** @summary "This character": the active Character's portrait and a caret. */
export const ThisCharacter: Story = { args: { value: 'current' } };

/** @summary All of two Characters: two overlapping faces, the active one first. */
export const TwoCharacters: Story = {
  args: { characterCount: 2 },
  loaders: [seedRoster(2)],
};

/** @summary All of three Characters: three faces, no chip. */
export const ThreeCharacters: Story = {
  args: { characterCount: 3 },
  loaders: [seedRoster(3)],
};

/** @summary All of six Characters: three faces and a "+3" chip. */
export const SixCharacters: Story = {
  args: { characterCount: 6 },
  loaders: [seedRoster(6)],
};

/** @summary Six Characters at 390 wide: two faces and a "+4" chip, so the phone title keeps its room. */
export const SixCharactersPhone: Story = {
  ...SixCharacters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary Corporation: the active Character's corp logo (the Buildings glyph until it loads). */
export const Corporation: Story = {
  render: (args) => (
    <CharacterFilterControl<CharacterScopeChoice>
      {...args}
      corporation
      value="corporation"
      onChange={() => {}}
    />
  ),
};

/** @summary Partial coverage: a warning dot, the missing Character's face left out of the stack. */
export const Partial: Story = { args: { missingNames: ['Pilot 2'] } };

/** @summary `loading`: a spinner over the faces, the trigger's width unchanged. */
export const Loading: Story = { args: { loading: true } };
